-- QuickCut Platform - Stage D: ₹5 Platform Billing, Invoice Protection & Payment Integrity
-- Migration: 20261023000004_billing_and_payments.sql

-- 1. Repeatable & Hardened Monthly Fee Aggregator
CREATE OR REPLACE FUNCTION public.generate_monthly_fee_record(
    p_shop_id UUID, 
    p_month TEXT
)
RETURNS UUID AS $$
DECLARE
    v_billable_count INTEGER := 0;
    v_rate NUMERIC(10, 2) := 5.00;
    v_amount NUMERIC(10, 2) := 0.00;
    v_disputed_until TIMESTAMPTZ;
    v_existing public.fee_records%ROWTYPE;
    v_record_id UUID;
    v_shop_tz TEXT;
BEGIN
    -- 1a. Validate strict YYYY-MM format
    IF p_month IS NULL OR p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Invalid month format: "%". Expected strict YYYY-MM format.', p_month;
    END IF;

    -- 1b. Caller Authorization: Super Admin or Shop Owner
    IF NOT (public.is_admin() OR public.is_shop_owner(p_shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot generate fee statements for shop %.', p_shop_id;
    END IF;

    -- 1c. Fetch shop's local timezone
    SELECT COALESCE(timezone, 'Asia/Kolkata') INTO v_shop_tz
    FROM public.shops
    WHERE id = p_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop with ID % does not exist.', p_shop_id;
    END IF;

    -- 1d. Check for existing invoice
    SELECT * INTO v_existing
    FROM public.fee_records
    WHERE shop_id = p_shop_id AND month = p_month
    FOR UPDATE;

    -- Invariant: Paid invoices are immutable
    IF FOUND AND v_existing.status = 'paid' THEN
        RETURN v_existing.id;
    END IF;

    -- Invariant: Disputed invoices cannot be overwritten silently
    IF FOUND AND v_existing.status = 'disputed' THEN
        RETURN v_existing.id;
    END IF;

    -- 1e. Count only eligible completed services within that calendar month in shop's local timezone
    -- Billing Rule: is_billable = true, status = 'completed', is_walkin = false, customer QR checked in
    SELECT COUNT(*)
    INTO v_billable_count
    FROM public.queue_entries qe
    WHERE qe.shop_id = p_shop_id
      AND qe.is_billable = true
      AND qe.status = 'completed'
      AND to_char(timezone(v_shop_tz, qe.completed_at), 'YYYY-MM') = p_month;

    v_amount := v_billable_count * v_rate;
    v_disputed_until := COALESCE(v_existing.disputed_until, timezone('utc'::text, now()) + INTERVAL '7 days');

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
    WHERE public.fee_records.status NOT IN ('paid', 'disputed')
    RETURNING id INTO v_record_id;

    RETURN COALESCE(v_record_id, v_existing.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Controlled Fee Dispute RPC
CREATE OR REPLACE FUNCTION public.dispute_fee_record(
    p_fee_record_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_record public.fee_records%ROWTYPE;
BEGIN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'A dispute reason must be provided.';
    END IF;

    SELECT * INTO v_record
    FROM public.fee_records
    WHERE id = p_fee_record_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee invoice not found.';
    END IF;

    -- Verify caller is shop owner or admin
    IF NOT (public.is_admin() OR public.is_shop_owner(v_record.shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot dispute this fee statement.';
    END IF;

    -- Check if already settled
    IF v_record.status = 'paid' THEN
        RAISE EXCEPTION 'Paid invoices cannot be disputed.';
    END IF;

    -- Check 7-day dispute window
    IF timezone('utc'::text, now()) > v_record.disputed_until THEN
        RAISE EXCEPTION 'The 7-day dispute window for statement month % closed on %.',
            v_record.month, to_char(v_record.disputed_until, 'YYYY-MM-DD');
    END IF;

    -- Set status to disputed
    UPDATE public.fee_records
    SET status = 'disputed',
        dispute_reason = TRIM(p_reason),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_fee_record_id;

    -- Log audit entry
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, payload)
    VALUES (
        auth.uid(),
        'FEE_INVOICE_DISPUTED',
        'fee_records',
        p_fee_record_id::text,
        jsonb_build_object(
            'shop_id', v_record.shop_id,
            'month', v_record.month,
            'amount', v_record.amount,
            'reason', TRIM(p_reason)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'fee_record_id', p_fee_record_id,
        'status', 'disputed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Fee Records Column Protection Trigger
CREATE OR REPLACE FUNCTION public.fn_protect_fee_record_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Super Admin can perform administrative corrections
    IF public.is_admin() THEN
        NEW.updated_at := timezone('utc'::text, now());
        RETURN NEW;
    END IF;

    -- Non-admin callers (owners) can NEVER modify financial figures
    NEW.amount := OLD.amount;
    NEW.billable_count := OLD.billable_count;
    NEW.rate_per_service := OLD.rate_per_service;
    NEW.month := OLD.month;
    NEW.shop_id := OLD.shop_id;
    NEW.disputed_until := OLD.disputed_until;

    -- Owner can only dispute within the active window
    IF NEW.status = 'disputed' THEN
        IF timezone('utc'::text, now()) > OLD.disputed_until THEN
            RAISE EXCEPTION 'Dispute window for invoice % has expired.', OLD.id;
        END IF;
    ELSIF NEW.status != OLD.status THEN
        -- Owners cannot set status to 'paid', 'waived', etc. directly
        RAISE EXCEPTION 'Unauthorized fee status transition to "%". Use official settlement or admin workflow.', NEW.status;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_fee_record_updates ON public.fee_records;
CREATE TRIGGER trg_protect_fee_record_updates
BEFORE UPDATE ON public.fee_records
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_fee_record_updates();

-- 4. Secure Fee Payment Settlement RPC
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

    -- Caller authorization
    IF NOT (public.is_admin() OR public.is_shop_owner(v_record.shop_id)) THEN
        RAISE EXCEPTION 'Unauthorized to settle fees for this shop.';
    END IF;

    -- Idempotent check
    IF v_record.status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'amount', v_record.amount,
            'fee_record_id', v_record.id
        );
    END IF;

    -- Disputed invoice protection
    IF v_record.status = 'disputed' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Invoice is currently under dispute review. Administrator must resolve before settlement.';
    END IF;

    v_ref := COALESCE(
        p_transaction_ref, 
        'UPI/' || to_char(now(), 'YYYYMMDD') || '/' || floor(10000000 + random() * 90000000)::text
    );

    -- Prevent duplicate transaction reference
    IF EXISTS (SELECT 1 FROM public.payments WHERE transaction_ref = v_ref) THEN
        RAISE EXCEPTION 'Payment reference % has already been recorded.', v_ref;
    END IF;

    -- 1. Insert authoritative payment record
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

    -- 3. Audit log entry
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, payload)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. Administrative Fee Adjustment RPC
CREATE OR REPLACE FUNCTION public.admin_adjust_fee_record(
    p_fee_record_id UUID,
    p_new_status fee_status,
    p_adjusted_amount NUMERIC(10, 2),
    p_admin_note TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_old_status fee_status;
    v_old_amount NUMERIC(10, 2);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Super Admin privileges required.';
    END IF;

    SELECT status, amount INTO v_old_status, v_old_amount
    FROM public.fee_records
    WHERE id = p_fee_record_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee invoice not found.';
    END IF;

    UPDATE public.fee_records
    SET status = p_new_status,
        amount = COALESCE(p_adjusted_amount, amount),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_fee_record_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, payload)
    VALUES (
        auth.uid(),
        'ADMIN_FEE_ADJUSTMENT',
        'fee_records',
        p_fee_record_id::text,
        jsonb_build_object(
            'old_status', v_old_status,
            'new_status', p_new_status,
            'old_amount', v_old_amount,
            'new_amount', p_adjusted_amount,
            'note', p_admin_note
        )
    );

    RETURN jsonb_build_object('success', true, 'fee_record_id', p_fee_record_id, 'status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Restrict Function Permissions
REVOKE ALL ON FUNCTION public.generate_monthly_fee_record(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_fee_record(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dispute_fee_record(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_fee_record(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_fee_payment(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_fee_payment(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_adjust_fee_record(UUID, fee_status, NUMERIC(10, 2), TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_fee_record(UUID, fee_status, NUMERIC(10, 2), TEXT) TO authenticated, service_role;
