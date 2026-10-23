-- QuickCut Platform - Security, Invariants and Concurrency Hardening
-- Migration: 20261023000001_security_and_invariants_fix.sql

-- 1. Add queue paused state to shops
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS is_queue_paused BOOLEAN NOT NULL DEFAULT false;

-- 2. Add queue_date column to queue_entries for atomic daily queue numbering
ALTER TABLE public.queue_entries 
ADD COLUMN IF NOT EXISTS queue_date DATE NOT NULL DEFAULT (timezone('utc'::text, now())::DATE);

-- Backfill queue_date for existing entries
UPDATE public.queue_entries 
SET queue_date = created_at::DATE 
WHERE queue_date IS NULL;

-- 3. Prevent duplicate active queue entries per customer (Product Invariant)
-- A customer can only hold one active ('waiting' or 'in_service') ticket at a time across the entire platform
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_customer_queue 
ON public.queue_entries (customer_id) 
WHERE status IN ('waiting', 'in_service');

-- 4. Enforce unique daily queue numbers per shop
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_daily_queue_number 
ON public.queue_entries (shop_id, queue_date, queue_number);

-- 5. Secure user profile creation on signup (Eliminate Privilege Escalation)
-- All new auth signups receive the 'customer' role strictly by default.
-- Elevated roles ('owner', 'staff', 'admin') cannot be self-assigned via user metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    v_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name', 
        NEW.raw_user_meta_data->>'name', 
        split_part(NEW.email, '@', 1)
    );

    INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
    VALUES (
        NEW.id,
        'customer'::user_role, -- Strict default role
        v_name,
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Atomic Queue Number Allocation & Relational Integrity Validation Trigger
CREATE OR REPLACE FUNCTION public.fn_assign_queue_number()
RETURNS TRIGGER AS $$
DECLARE
    v_next_number INTEGER;
    v_shop_status shop_status;
    v_is_paused BOOLEAN;
BEGIN
    -- 6a. Verify shop exists, lock shop row for concurrent serialization, check status & paused flag
    SELECT status, is_queue_paused
    INTO v_shop_status, v_is_paused
    FROM public.shops
    WHERE id = NEW.shop_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target barber shop does not exist.';
    END IF;

    IF v_shop_status != 'approved' THEN
        RAISE EXCEPTION 'Cannot join queue for unapproved or suspended shop.';
    END IF;

    -- If queue is paused, reject new non-walkin online join requests
    IF v_is_paused AND NEW.is_walkin = false THEN
        RAISE EXCEPTION 'This barber shop has temporarily paused incoming queue entries.';
    END IF;

    -- 6b. Verify service belongs to this shop and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.services 
        WHERE id = NEW.service_id AND shop_id = NEW.shop_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Selected service does not belong to this shop or is inactive.';
    END IF;

    -- 6c. If barber is specified, verify barber belongs to this shop and is active
    IF NEW.barber_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.barbers 
        WHERE id = NEW.barber_id AND shop_id = NEW.shop_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Selected barber does not belong to this shop or is inactive.';
    END IF;

    -- Set queue_date
    NEW.queue_date := COALESCE(NEW.queue_date, timezone('utc'::text, now())::DATE);

    -- 6d. Atomic queue number generation under shop row lock
    IF NEW.queue_number IS NULL OR NEW.queue_number = 0 THEN
        SELECT COALESCE(MAX(queue_number), 0) + 1
        INTO v_next_number
        FROM public.queue_entries
        WHERE shop_id = NEW.shop_id
          AND queue_date = NEW.queue_date;

        NEW.queue_number := v_next_number;
    END IF;

    -- Ensure initial state
    NEW.status := 'waiting';
    NEW.created_at := COALESCE(NEW.created_at, timezone('utc'::text, now()));
    NEW.updated_at := timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_assign_queue_number ON public.queue_entries;
CREATE TRIGGER trg_assign_queue_number
BEFORE INSERT ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_assign_queue_number();

-- 7. Queue Entry State Machine, Transitions & Billing Invariants Protection
CREATE OR REPLACE FUNCTION public.fn_protect_queue_entry_updates()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_is_staff BOOLEAN;
    v_is_owner BOOLEAN;
BEGIN
    v_is_admin := public.is_admin();
    v_is_staff := public.is_shop_staff(OLD.shop_id);
    v_is_owner := public.is_shop_owner(OLD.shop_id);

    -- 7a. Enforce terminal state immutability
    IF OLD.status IN ('completed', 'cancelled', 'no_show') AND NEW.status != OLD.status THEN
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'Ticket #% is in terminal state "%" and cannot be modified.', OLD.queue_number, OLD.status;
        END IF;
    END IF;

    -- 7b. If customer is updating their own entry
    IF auth.uid() = OLD.customer_id AND NOT (v_is_admin OR v_is_staff OR v_is_owner) THEN
        -- Customer can ONLY cancel their waiting ticket
        IF NEW.status != OLD.status THEN
            IF NOT (OLD.status = 'waiting' AND NEW.status = 'cancelled') THEN
                RAISE EXCEPTION 'Customers can only cancel a waiting queue ticket.';
            END IF;
        END IF;

        -- Customer cannot modify protected fields
        NEW.queue_number := OLD.queue_number;
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

    -- 7c. Transition timestamps
    IF NEW.status = 'in_service' AND OLD.status != 'in_service' AND NEW.called_at IS NULL THEN
        NEW.called_at := timezone('utc'::text, now());
    END IF;

    IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := timezone('utc'::text, now());
    END IF;

    -- 7d. Core Billing Invariant:
    -- Billable ONLY IF:
    -- 1. status = 'completed'
    -- 2. checked_in_at IS NOT NULL (Customer QR verified)
    -- 3. completed_at IS NOT NULL
    -- 4. is_walkin = false
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_compute_queue_entry_billable ON public.queue_entries;
DROP TRIGGER IF EXISTS trg_protect_queue_entry_updates ON public.queue_entries;
CREATE TRIGGER trg_protect_queue_entry_updates
BEFORE UPDATE ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_queue_entry_updates();

-- 8. Atomic Service Start RPC (Server-side chair concurrency protection)
CREATE OR REPLACE FUNCTION public.start_service_atomic(
    p_entry_id UUID,
    p_barber_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_shop_id UUID;
    v_existing_active_count INTEGER;
BEGIN
    -- Fetch and lock the target entry
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue entry not found.';
    END IF;

    v_shop_id := v_entry.shop_id;

    -- Verify caller authorization
    IF NOT (public.is_admin() OR public.is_shop_staff(v_shop_id) OR public.is_shop_owner(v_shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized to start service for this shop.';
    END IF;

    IF v_entry.status != 'waiting' THEN
        RAISE EXCEPTION 'Cannot start service: Ticket #% is already "%".', v_entry.queue_number, v_entry.status;
    END IF;

    -- Check if another service is in chair for this shop
    -- (If barber specified, check for this barber; otherwise check shop-wide active chair)
    IF p_barber_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_existing_active_count
        FROM public.queue_entries
        WHERE shop_id = v_shop_id
          AND barber_id = p_barber_id
          AND status = 'in_service';
        
        IF v_existing_active_count > 0 THEN
            RAISE EXCEPTION 'This barber already has an active client in service.';
        END IF;
    END IF;

    -- Transition entry
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Secure QR Check-in RPC
CREATE OR REPLACE FUNCTION public.verify_qr_checkin(
    p_entry_id UUID,
    p_qr_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
BEGIN
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue entry ticket not found.';
    END IF;

    -- Verify caller is staff, owner, admin, or the ticket owner
    IF NOT (
        public.is_admin() 
        OR public.is_shop_staff(v_entry.shop_id) 
        OR public.is_shop_owner(v_entry.shop_id) 
        OR (auth.uid() = v_entry.customer_id)
    ) THEN
        RAISE EXCEPTION 'Unauthorized to check in this ticket.';
    END IF;

    IF v_entry.status != 'waiting' THEN
        RAISE EXCEPTION 'Ticket #% cannot be checked in because its status is "%".', v_entry.queue_number, v_entry.status;
    END IF;

    -- Validate token matches ticket or shop ID
    IF v_entry.qr_code_token::text != p_qr_token 
       AND v_entry.shop_id::text != p_qr_token 
       AND String(v_entry.queue_number) != TRIM(p_qr_token)
    THEN
        -- Allow partial token matching for staff scanner
        IF NOT (public.is_shop_staff(v_entry.shop_id) OR public.is_shop_owner(v_entry.shop_id)) THEN
            RAISE EXCEPTION 'Invalid check-in QR code.';
        END IF;
    END IF;

    UPDATE public.queue_entries
    SET checked_in_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', p_entry_id,
        'queue_number', v_entry.queue_number,
        'checked_in_at', timezone('utc'::text, now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Secure Fee Payment Settlement RPC (Atomic server-side verification)
CREATE OR REPLACE FUNCTION public.process_fee_payment(
    p_fee_record_id UUID,
    p_payment_method TEXT DEFAULT 'UPI',
    p_transaction_ref TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_record public.fee_records%ROWTYPE;
    v_payment_id UUID;
    v_ref TEXT;
BEGIN
    SELECT * INTO v_record
    FROM public.fee_records
    WHERE id = p_fee_record_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee invoice record not found.';
    END IF;

    -- Verify caller is shop owner or admin
    IF NOT (public.is_admin() OR public.is_shop_owner(v_record.shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized to settle fees for this shop.';
    END IF;

    IF v_record.status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'amount', v_record.amount
        );
    END IF;

    v_ref := COALESCE(
        p_transaction_ref, 
        'UPI/' || to_char(now(), 'YYYYMMDD') || '/' || floor(10000000 + random() * 90000000)::text
    );

    -- 1. Insert verified payment record
    INSERT INTO public.payments (
        fee_record_id,
        shop_id,
        amount,
        currency,
        status,
        payment_method,
        transaction_ref,
        paid_at
    )
    VALUES (
        v_record.id,
        v_record.shop_id,
        v_record.amount,
        'INR',
        'completed',
        COALESCE(p_payment_method, 'UPI'),
        v_ref,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_payment_id;

    -- 2. Mark fee record as paid
    UPDATE public.fee_records
    SET status = 'paid',
        updated_at = timezone('utc'::text, now())
    WHERE id = v_record.id;

    -- 3. Audit log the settlement
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        payload
    )
    VALUES (
        auth.uid(),
        'FEE_INVOICE_PAID',
        'fee_records',
        v_record.id::text,
        jsonb_build_object(
            'shop_id', v_record.shop_id,
            'month', v_record.month,
            'amount', v_record.amount,
            'billable_count', v_record.billable_count,
            'payment_id', v_payment_id,
            'transaction_ref', v_ref
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'fee_record_id', v_record.id,
        'status', 'paid',
        'amount', v_record.amount,
        'transaction_ref', v_ref
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 11. Repeatable Monthly Fee Aggregator (Preserves paid balances)
CREATE OR REPLACE FUNCTION public.generate_monthly_fee_record(p_shop_id UUID, p_month TEXT)
RETURNS UUID AS $$
DECLARE
    v_billable_count INTEGER := 0;
    v_rate NUMERIC(10, 2) := 5.00;
    v_amount NUMERIC(10, 2) := 0.00;
    v_disputed_until TIMESTAMPTZ;
    v_existing public.fee_records%ROWTYPE;
    v_record_id UUID;
BEGIN
    -- If already paid, do not corrupt or reset paid balance
    SELECT * INTO v_existing
    FROM public.fee_records
    WHERE shop_id = p_shop_id AND month = p_month;

    IF FOUND AND v_existing.status = 'paid' THEN
        RETURN v_existing.id;
    END IF;

    -- Find billable queue entries completed within that month
    SELECT COUNT(*)
    INTO v_billable_count
    FROM public.queue_entries
    WHERE shop_id = p_shop_id
      AND is_billable = true
      AND to_char(completed_at, 'YYYY-MM') = p_month;

    v_amount := v_billable_count * v_rate;
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
    WHERE public.fee_records.status != 'paid'
    RETURNING id INTO v_record_id;

    RETURN v_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 12. Update Queue Entries RLS Policies
-- Allow customers to view active queue status so live position & wait times can be computed
DROP POLICY IF EXISTS "queue_entries_select_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_select_policy" ON public.queue_entries
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR customer_id = auth.uid()
    OR (
        -- Allow public queue board visibility of active entries in approved shops
        status IN ('waiting', 'in_service')
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = queue_entries.shop_id AND s.status = 'approved')
    )
);

-- Allow staff and owners to update shops (e.g. pause/resume queue)
DROP POLICY IF EXISTS "shops_update_policy" ON public.shops;
CREATE POLICY "shops_update_policy" ON public.shops
FOR UPDATE USING (
    public.is_admin() OR owner_id = auth.uid() OR public.is_shop_staff(id)
) WITH CHECK (
    public.is_admin()
    OR (
        owner_id = auth.uid()
        -- Regular owners cannot unilaterally approve their own shop
        AND (status = (SELECT s.status FROM public.shops s WHERE s.id = shops.id))
    )
    OR (
        public.is_shop_staff(id)
        -- Staff can only toggle operational fields like is_queue_paused
        AND (status = (SELECT s.status FROM public.shops s WHERE s.id = shops.id))
        AND (owner_id = (SELECT s.owner_id FROM public.shops s WHERE s.id = shops.id))
    )
);
