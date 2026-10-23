-- QuickCut Platform - Stage C: Atomic Queue Numbering & Queue State Transitions
-- Migration: 20261023000003_atomic_queue_and_transitions.sql

-- 1. Atomic Daily Counter Table
CREATE TABLE IF NOT EXISTS public.shop_daily_counters (
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    queue_date DATE NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (shop_id, queue_date)
);

-- Backfill counters from existing queue entries
INSERT INTO public.shop_daily_counters (shop_id, queue_date, last_number)
SELECT shop_id, queue_date, COALESCE(MAX(queue_number), 0)
FROM public.queue_entries
GROUP BY shop_id, queue_date
ON CONFLICT (shop_id, queue_date) DO UPDATE
SET last_number = GREATEST(public.shop_daily_counters.last_number, EXCLUDED.last_number);

-- 2. Concurrency-Safe Queue Number Assigner
CREATE OR REPLACE FUNCTION public.fn_assign_queue_number()
RETURNS TRIGGER AS $$
DECLARE
    v_next_number INTEGER;
    v_shop_status shop_status;
    v_is_paused BOOLEAN;
    v_shop_tz TEXT;
    v_local_date DATE;
BEGIN
    -- 2a. Fetch shop status, paused state, and local timezone
    SELECT status, is_queue_paused, COALESCE(timezone, 'Asia/Kolkata')
    INTO v_shop_status, v_is_paused, v_shop_tz
    FROM public.shops
    WHERE id = NEW.shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target barber shop does not exist.';
    END IF;

    IF v_shop_status != 'approved' THEN
        RAISE EXCEPTION 'Cannot join queue for unapproved or suspended shop.';
    END IF;

    -- Reject non-walkin joins if queue is paused
    IF v_is_paused AND NEW.is_walkin = false THEN
        RAISE EXCEPTION 'This barber shop has temporarily paused incoming queue entries.';
    END IF;

    -- 2b. Verify service belongs to shop and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.services 
        WHERE id = NEW.service_id AND shop_id = NEW.shop_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Selected service does not belong to this shop or is inactive.';
    END IF;

    -- 2c. Verify barber belongs to shop and is active (if specified)
    IF NEW.barber_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.barbers 
        WHERE id = NEW.barber_id AND shop_id = NEW.shop_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Selected barber does not belong to this shop or is inactive.';
    END IF;

    -- 2d. Invariant: Only ONE active ticket per customer across the platform
    IF NEW.customer_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.queue_entries
        WHERE customer_id = NEW.customer_id
          AND status IN ('waiting', 'in_service')
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
        RAISE EXCEPTION 'Customer already holds an active queue ticket across the platform.';
    END IF;

    -- 2e. Set queue_date based on shop's local timezone (never implicit session timezone or UTC)
    v_local_date := (timezone(v_shop_tz, now()))::DATE;
    NEW.queue_date := v_local_date;

    -- 2f. Atomic queue number generation via shop_daily_counters upsert
    -- Never trust client-supplied queue numbers
    INSERT INTO public.shop_daily_counters (shop_id, queue_date, last_number)
    VALUES (NEW.shop_id, NEW.queue_date, 1)
    ON CONFLICT (shop_id, queue_date) DO UPDATE
    SET last_number = public.shop_daily_counters.last_number + 1
    RETURNING last_number INTO v_next_number;

    NEW.queue_number := v_next_number;

    -- 2g. Guarantee initial queue entry states
    NEW.status := 'waiting';
    NEW.is_billable := false;
    NEW.called_at := NULL;
    NEW.completed_at := NULL;
    NEW.qr_code_token := COALESCE(NEW.qr_code_token, gen_random_uuid());
    NEW.created_at := COALESCE(NEW.created_at, timezone('utc'::text, now()));
    NEW.updated_at := timezone('utc'::text, now());

    -- Walk-in check
    IF NEW.is_walkin = true THEN
        NEW.customer_id := NULL;
        NEW.checked_in_at := COALESCE(NEW.checked_in_at, timezone('utc'::text, now()));
    ELSE
        NEW.checked_in_at := NULL; -- Online customers MUST verify via QR check-in
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_assign_queue_number ON public.queue_entries;
CREATE TRIGGER trg_assign_queue_number
BEFORE INSERT ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_assign_queue_number();

-- 3. Repaired & Hardened QR Check-in Verification RPC
CREATE OR REPLACE FUNCTION public.verify_qr_checkin(
    p_entry_id UUID,
    p_qr_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_is_staff BOOLEAN;
    v_is_owner BOOLEAN;
    v_is_admin BOOLEAN;
    v_token_clean TEXT;
    v_json_payload JSONB;
    v_token_matched BOOLEAN := false;
BEGIN
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue entry ticket not found.';
    END IF;

    v_is_admin := public.is_admin();
    v_is_staff := public.is_shop_staff(v_entry.shop_id);
    v_is_owner := public.is_shop_owner(v_entry.shop_id);

    -- Caller authorization check
    IF NOT (v_is_admin OR v_is_staff OR v_is_owner OR (auth.uid() = v_entry.customer_id)) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot check in this queue entry.';
    END IF;

    -- Idempotent check: If already checked in, return success safely
    IF v_entry.checked_in_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'entry_id', p_entry_id,
            'queue_number', v_entry.queue_number,
            'checked_in_at', v_entry.checked_in_at,
            'already_checked_in', true
        );
    END IF;

    IF v_entry.status != 'waiting' THEN
        RAISE EXCEPTION 'Ticket #% cannot be checked in because its status is "%".', v_entry.queue_number, v_entry.status;
    END IF;

    v_token_clean := TRIM(p_qr_token);

    -- Check if token is JSON payload from generateQueueQRPayload
    IF v_token_clean LIKE '{%' THEN
        BEGIN
            v_json_payload := v_token_clean::jsonb;
            IF (v_json_payload->>'platform') = 'QuickCut'
               AND (v_json_payload->>'entryId') = v_entry.id::text
               AND (v_json_payload->>'shopId') = v_entry.shop_id::text
               AND (v_json_payload->>'token') = v_entry.qr_code_token::text
            THEN
                v_token_matched := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_token_matched := false;
        END;
    END IF;

    -- Direct token matches (Fix: replace JavaScript String() with v_entry.queue_number::text)
    IF NOT v_token_matched THEN
        IF v_entry.qr_code_token::text = v_token_clean
           OR v_entry.shop_id::text = v_token_clean
           OR v_entry.queue_number::text = v_token_clean
        THEN
            v_token_matched := true;
        ELSIF (v_is_staff OR v_is_owner OR v_is_admin) AND length(v_token_clean) >= 4 AND v_entry.qr_code_token::text ILIKE ('%' || v_token_clean || '%') THEN
            v_token_matched := true;
        END IF;
    END IF;

    IF NOT v_token_matched THEN
        RAISE EXCEPTION 'Invalid check-in QR code or token for Ticket #%.', v_entry.queue_number;
    END IF;

    -- Record verified arrival check-in using trusted server database time
    UPDATE public.queue_entries
    SET checked_in_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', p_entry_id,
        'queue_number', v_entry.queue_number,
        'checked_in_at', timezone('utc'::text, now()),
        'already_checked_in', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Queue State Machine & Billing Invariant Protection Trigger
CREATE OR REPLACE FUNCTION public.fn_protect_queue_entry_updates()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_is_staff BOOLEAN;
    v_is_owner BOOLEAN;
    v_is_customer BOOLEAN;
BEGIN
    v_is_admin := public.is_admin();
    v_is_staff := public.is_shop_staff(OLD.shop_id);
    v_is_owner := public.is_shop_owner(OLD.shop_id);
    v_is_customer := (auth.uid() = OLD.customer_id);

    -- 4a. Terminal State Protection: Once completed, cancelled, or no_show, status is immutable
    IF OLD.status IN ('completed', 'cancelled', 'no_show') AND NEW.status != OLD.status THEN
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'Ticket #% is in terminal state "%" and cannot be modified.', OLD.queue_number, OLD.status;
        END IF;
    END IF;

    -- 4b. Customer Update Restrictions: Customers can ONLY cancel their waiting ticket
    IF v_is_customer AND NOT (v_is_admin OR v_is_staff OR v_is_owner) THEN
        IF NEW.status != OLD.status THEN
            IF NOT (OLD.status = 'waiting' AND NEW.status = 'cancelled') THEN
                RAISE EXCEPTION 'Customers can only cancel a waiting queue ticket.';
            END IF;
        END IF;

        -- Revert any client tampering on sensitive fields
        NEW.queue_number := OLD.queue_number;
        NEW.queue_date := OLD.queue_date;
        NEW.shop_id := OLD.shop_id;
        NEW.service_id := OLD.service_id;
        NEW.barber_id := OLD.barber_id;
        NEW.is_walkin := OLD.is_walkin;
        NEW.is_billable := OLD.is_billable;
        NEW.completed_at := OLD.completed_at;
        NEW.called_at := OLD.called_at;
        NEW.checked_in_at := OLD.checked_in_at;
        NEW.qr_code_token := OLD.qr_code_token;
    END IF;

    -- 4c. Valid Lifecycle Transitions Enforcement:
    -- waiting -> in_service, cancelled, no_show (or completed if walk-in)
    -- in_service -> completed, cancelled, no_show
    IF NEW.status != OLD.status AND NOT v_is_admin THEN
        IF OLD.status = 'waiting' AND NEW.status = 'completed' AND OLD.is_walkin = false THEN
            RAISE EXCEPTION 'Online ticket #% must be called in_service before completion.', OLD.queue_number;
        END IF;
    END IF;

    -- 4d. Automated Trusted Timestamps
    IF NEW.status = 'in_service' AND OLD.status != 'in_service' AND NEW.called_at IS NULL THEN
        NEW.called_at := timezone('utc'::text, now());
    END IF;

    IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := timezone('utc'::text, now());
    END IF;

    -- 4e. Core Platform ₹5 Billing Invariant:
    -- A queue entry is billable ONLY IF:
    -- 1. status = 'completed'
    -- 2. checked_in_at IS NOT NULL (Customer QR verified arrival)
    -- 3. completed_at IS NOT NULL
    -- 4. is_walkin = false (Never walk-ins)
    IF NEW.status = 'completed'
       AND NEW.checked_in_at IS NOT NULL
       AND NEW.completed_at IS NOT NULL
       AND NEW.is_walkin = false
    THEN
        NEW.is_billable := true;
    ELSE
        NEW.is_billable := false;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_queue_entry_updates ON public.queue_entries;
CREATE TRIGGER trg_protect_queue_entry_updates
BEFORE UPDATE ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_queue_entry_updates();

-- 5. Atomic Service Start RPC
CREATE OR REPLACE FUNCTION public.start_service_atomic(
    p_entry_id UUID,
    p_barber_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_shop_id UUID;
    v_existing_active_count INTEGER := 0;
    v_barber_count INTEGER := 0;
BEGIN
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue entry not found.';
    END IF;

    v_shop_id := v_entry.shop_id;

    IF NOT (public.is_admin() OR public.is_shop_staff(v_shop_id) OR public.is_shop_owner(v_shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized to start service for this shop.';
    END IF;

    IF v_entry.status != 'waiting' THEN
        RAISE EXCEPTION 'Cannot start service: Ticket #% is already "%".', v_entry.queue_number, v_entry.status;
    END IF;

    -- Check chair / barber conflict
    IF p_barber_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_existing_active_count
        FROM public.queue_entries
        WHERE shop_id = v_shop_id
          AND barber_id = p_barber_id
          AND status = 'in_service';
        
        IF v_existing_active_count > 0 THEN
            RAISE EXCEPTION 'This barber already has an active client in service.';
        END IF;
    ELSE
        SELECT COUNT(*) INTO v_barber_count FROM public.barbers WHERE shop_id = v_shop_id AND is_active = true;
        IF v_barber_count <= 1 THEN
            SELECT COUNT(*) INTO v_existing_active_count
            FROM public.queue_entries
            WHERE shop_id = v_shop_id
              AND status = 'in_service';
            IF v_existing_active_count > 0 THEN
                RAISE EXCEPTION 'Shop chair is currently occupied with an active client.';
            END IF;
        END IF;
    END IF;

    UPDATE public.queue_entries
    SET status = 'in_service',
        called_at = timezone('utc'::text, now()),
        barber_id = COALESCE(p_barber_id, barber_id),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', p_entry_id,
        'status', 'in_service',
        'queue_number', v_entry.queue_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Atomic Service Completion RPC (Returns authoritative backend billing calculation)
CREATE OR REPLACE FUNCTION public.complete_service_atomic(
    p_entry_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_shop_id UUID;
    v_is_billable BOOLEAN;
BEGIN
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue entry not found.';
    END IF;

    v_shop_id := v_entry.shop_id;

    IF NOT (public.is_admin() OR public.is_shop_staff(v_shop_id) OR public.is_shop_owner(v_shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized to complete service for this shop.';
    END IF;

    IF v_entry.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'entry_id', p_entry_id,
            'queue_number', v_entry.queue_number,
            'status', 'completed',
            'is_billable', v_entry.is_billable,
            'platform_fee_inr', CASE WHEN v_entry.is_billable THEN 5.00 ELSE 0.00 END,
            'already_completed', true
        );
    END IF;

    IF v_entry.status NOT IN ('in_service', 'waiting') THEN
        RAISE EXCEPTION 'Cannot complete ticket #% with status "%".', v_entry.queue_number, v_entry.status;
    END IF;

    UPDATE public.queue_entries
    SET status = 'completed',
        completed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id
    RETURNING is_billable INTO v_is_billable;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', p_entry_id,
        'queue_number', v_entry.queue_number,
        'status', 'completed',
        'is_billable', v_is_billable,
        'platform_fee_inr', CASE WHEN v_is_billable THEN 5.00 ELSE 0.00 END,
        'already_completed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. Secure Customer Queue Join RPC
CREATE OR REPLACE FUNCTION public.join_queue(
    p_shop_id UUID,
    p_service_id UUID,
    p_barber_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_new_id UUID;
    v_queue_number INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join queue.';
    END IF;

    INSERT INTO public.queue_entries (
        shop_id,
        customer_id,
        service_id,
        barber_id,
        is_walkin,
        status
    )
    VALUES (
        p_shop_id,
        auth.uid(),
        p_service_id,
        p_barber_id,
        false,
        'waiting'
    )
    RETURNING id, queue_number INTO v_new_id, v_queue_number;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_new_id,
        'queue_number', v_queue_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8. Restrict Function Permissions
REVOKE ALL ON FUNCTION public.verify_qr_checkin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_qr_checkin(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.start_service_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_service_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_service_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_service_atomic(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.join_queue(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_queue(UUID, UUID, UUID) TO authenticated, service_role;
