-- QuickCut Platform - Business Logic Triggers and Helper Functions
-- Migration: 20261022000003_functions_and_triggers.sql

-- 1. Automatic User Profile Creation on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role user_role := 'customer';
    v_name TEXT;
BEGIN
    -- Check if metadata specifies role (e.g. during onboarding invite or registration)
    IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
        BEGIN
            v_role := (NEW.raw_user_meta_data->>'role')::user_role;
        EXCEPTION WHEN OTHERS THEN
            v_role := 'customer';
        END;
    END IF;

    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

    INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
    VALUES (
        NEW.id,
        v_role,
        v_name,
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Billable Computation Trigger
-- Rule: A queue entry is billable ONLY IF:
-- - customer QR check-in exists (checked_in_at IS NOT NULL)
-- - AND staff completion exists (completed_at IS NOT NULL)
-- - AND status = 'completed'
-- - AND is_walkin = false
-- Fee rate: Rs 5 per billable service
CREATE OR REPLACE FUNCTION public.fn_compute_queue_entry_billable()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.checked_in_at IS NOT NULL
       AND NEW.completed_at IS NOT NULL
       AND NEW.status = 'completed'
       AND NEW.is_walkin = false
    THEN
        NEW.is_billable := true;
    ELSE
        NEW.is_billable := false;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_queue_entry_billable ON public.queue_entries;
CREATE TRIGGER trg_compute_queue_entry_billable
BEFORE INSERT OR UPDATE ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_compute_queue_entry_billable();

-- 3. Automatic Queue Number Assigner
CREATE OR REPLACE FUNCTION public.fn_assign_queue_number()
RETURNS TRIGGER AS $$
DECLARE
    v_next_number INTEGER;
BEGIN
    IF NEW.queue_number IS NULL OR NEW.queue_number = 0 THEN
        SELECT COALESCE(MAX(queue_number), 0) + 1
        INTO v_next_number
        FROM public.queue_entries
        WHERE shop_id = NEW.shop_id
          AND created_at::DATE = CURRENT_DATE;

        NEW.queue_number := v_next_number;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_queue_number ON public.queue_entries;
CREATE TRIGGER trg_assign_queue_number
BEFORE INSERT ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_assign_queue_number();

-- 4. Estimated Wait Time Function for Target Queue Entry
-- Rule: Estimated wait = sum of avg_minutes of services ahead in the queue. Show it as an estimate.
CREATE OR REPLACE FUNCTION public.get_estimated_wait_time(target_queue_entry_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_created_at TIMESTAMPTZ;
    v_status queue_status;
    v_service_id UUID;
    v_total_wait_minutes INTEGER := 0;
    v_people_ahead INTEGER := 0;
BEGIN
    SELECT shop_id, created_at, status, service_id
    INTO v_shop_id, v_created_at, v_status, v_service_id
    FROM public.queue_entries
    WHERE id = target_queue_entry_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'estimated_minutes', 0,
            'people_ahead', 0,
            'status', 'not_found',
            'is_estimate', true
        );
    END IF;

    IF v_status != 'waiting' THEN
        RETURN jsonb_build_object(
            'estimated_minutes', 0,
            'people_ahead', 0,
            'status', v_status,
            'is_estimate', true
        );
    END IF;

    -- Calculate sum of avg_minutes for entries ahead:
    -- 1. All entries with status = 'waiting' created before target
    -- 2. All entries currently 'in_service' in the same shop
    SELECT 
        COALESCE(SUM(s.avg_minutes), 0),
        COUNT(qe.id)
    INTO v_total_wait_minutes, v_people_ahead
    FROM public.queue_entries qe
    JOIN public.services s ON qe.service_id = s.id
    WHERE qe.shop_id = v_shop_id
      AND (
          (qe.status = 'waiting' AND qe.created_at < v_created_at)
          OR (qe.status = 'in_service')
      );

    RETURN jsonb_build_object(
        'estimated_minutes', v_total_wait_minutes,
        'people_ahead', v_people_ahead,
        'status', 'waiting',
        'is_estimate', true,
        'disclaimer', 'Estimated wait time is dynamic and may vary based on service complexity.'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 5. Estimated Wait Time for New Customers Joining a Shop
CREATE OR REPLACE FUNCTION public.get_shop_current_wait(target_shop_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_total_minutes INTEGER := 0;
    v_waiting_count INTEGER := 0;
    v_in_service_count INTEGER := 0;
BEGIN
    SELECT 
        COALESCE(SUM(s.avg_minutes), 0),
        COUNT(CASE WHEN qe.status = 'waiting' THEN 1 END),
        COUNT(CASE WHEN qe.status = 'in_service' THEN 1 END)
    INTO v_total_minutes, v_waiting_count, v_in_service_count
    FROM public.queue_entries qe
    JOIN public.services s ON qe.service_id = s.id
    WHERE qe.shop_id = target_shop_id
      AND qe.status IN ('waiting', 'in_service');

    RETURN jsonb_build_object(
        'estimated_minutes', v_total_minutes,
        'waiting_count', v_waiting_count,
        'in_service_count', v_in_service_count,
        'is_estimate', true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 6. Monthly Fee Aggregator Function
-- Calculates monthly billable cuts (Rs 5/service) and generates fee_records
CREATE OR REPLACE FUNCTION public.generate_monthly_fee_record(p_shop_id UUID, p_month TEXT)
RETURNS UUID AS $$
DECLARE
    v_billable_count INTEGER := 0;
    v_rate NUMERIC(10, 2) := 5.00;
    v_amount NUMERIC(10, 2) := 0.00;
    v_disputed_until TIMESTAMPTZ;
    v_record_id UUID;
BEGIN
    -- Month format expectation: 'YYYY-MM'
    -- Find billable queue entries completed within that month
    SELECT COUNT(*)
    INTO v_billable_count
    FROM public.queue_entries
    WHERE shop_id = p_shop_id
      AND is_billable = true
      AND to_char(completed_at, 'YYYY-MM') = p_month;

    v_amount := v_billable_count * v_rate;
    -- 7-day dispute window after generation
    v_disputed_until := timezone('utc'::text, now()) + INTERVAL '7 days';

    INSERT INTO public.fee_records (
        shop_id,
        month,
        billable_count,
        rate_per_service,
        amount,
        status,
        disputed_until
    )
    VALUES (
        p_shop_id,
        p_month,
        v_billable_count,
        v_rate,
        v_amount,
        'pending',
        v_disputed_until
    )
    ON CONFLICT (shop_id, month) DO UPDATE
    SET billable_count = EXCLUDED.billable_count,
        amount = EXCLUDED.amount,
        updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_record_id;

    RETURN v_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
