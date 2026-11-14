-- QuickCut Platform - Stage E: Queue Aggregates, Security Hardening & Concurrency Protection
-- Migration: 20261024000002_fix_queue_aggregates_and_security.sql
-- Fixes:
-- 1. SEC-01: get_shops_queue_summary() RPC for privacy-preserving shop discovery metrics
-- 2. SEC-02: get_estimated_wait_time() multi-barber parallel estimation
-- 3. SEC-04: verify_qr_checkin() hardening (prevent remote self-checkin via queue numbers)
-- 4. SEC-05: audit_logs_insert_policy restricted to admins
-- 5. SEC-07: start_service_atomic() chair capacity validation
-- 6. Missing database performance indexes

-- ============================================================================
-- 1. SEC-01: Secure Shop Discovery Queue Summary RPC
-- ============================================================================
-- Returns aggregated queue metrics without exposing customer names, phones, or tokens.
-- Respects customer privacy while fixing the 0-waiting issue in the customer app.

CREATE OR REPLACE FUNCTION public.get_shops_queue_summary()
RETURNS TABLE (
    shop_id UUID,
    waiting_count BIGINT,
    in_service_count BIGINT,
    active_barbers_count BIGINT,
    estimated_wait_minutes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH active_barbers_per_shop AS (
        SELECT b.shop_id AS b_shop_id, COUNT(b.id)::BIGINT AS barber_count
        FROM public.barbers b
        WHERE b.is_active = true
        GROUP BY b.shop_id
    ),
    queue_counts AS (
        SELECT 
            qe.shop_id AS q_shop_id,
            COUNT(CASE WHEN qe.status = 'waiting' THEN 1 END)::BIGINT AS waiting_cnt,
            COUNT(CASE WHEN qe.status = 'in_service' THEN 1 END)::BIGINT AS in_service_cnt,
            COALESCE(SUM(s.avg_minutes), 0)::BIGINT AS total_duration
        FROM public.queue_entries qe
        JOIN public.services s ON qe.service_id = s.id
        WHERE qe.status IN ('waiting', 'in_service')
        GROUP BY qe.shop_id
    )
    SELECT 
        sh.id AS shop_id,
        COALESCE(qc.waiting_cnt, 0)::BIGINT AS waiting_count,
        COALESCE(qc.in_service_cnt, 0)::BIGINT AS in_service_count,
        GREATEST(COALESCE(ab.barber_count, 1), 1)::BIGINT AS active_barbers_count,
        -- Parallel wait estimate: total workload divided across active parallel barbers
        (CEIL(COALESCE(qc.total_duration, 0)::NUMERIC / GREATEST(COALESCE(ab.barber_count, 1), 1)))::BIGINT AS estimated_wait_minutes
    FROM public.shops sh
    LEFT JOIN queue_counts qc ON sh.id = qc.q_shop_id
    LEFT JOIN active_barbers_per_shop ab ON sh.id = ab.b_shop_id
    WHERE sh.status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_shops_queue_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shops_queue_summary() TO anon, authenticated, service_role;

-- ============================================================================
-- 2. SEC-02: Multi-Barber Waiting Time Estimation (get_estimated_wait_time)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_estimated_wait_time(target_queue_entry_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_created_at TIMESTAMPTZ;
    v_status queue_status;
    v_active_barbers INTEGER := 1;
    v_total_wait_minutes INTEGER := 0;
    v_people_ahead INTEGER := 0;
    v_estimated_minutes INTEGER := 0;
BEGIN
    SELECT shop_id, created_at, status
    INTO v_shop_id, v_created_at, v_status
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

    -- Count active barbers in this shop (default to at least 1)
    SELECT GREATEST(COUNT(*), 1)
    INTO v_active_barbers
    FROM public.barbers
    WHERE shop_id = v_shop_id AND is_active = true;

    -- Calculate total duration of entries waiting ahead
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

    -- Divide total workload across active parallel barbers
    v_estimated_minutes := CEIL(v_total_wait_minutes::NUMERIC / v_active_barbers);

    RETURN jsonb_build_object(
        'estimated_minutes', v_estimated_minutes,
        'people_ahead', v_people_ahead,
        'active_barbers', v_active_barbers,
        'status', 'waiting',
        'is_estimate', true,
        'disclaimer', 'Estimated wait time is dynamically calculated based on queue progress and active barbers.'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_estimated_wait_time(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_estimated_wait_time(UUID) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. SEC-04: Hardened QR Check-In Verification (verify_qr_checkin)
-- ============================================================================
-- Prevents customers from self-checking in remotely via guessable queue numbers.

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
    v_is_customer BOOLEAN;
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
    v_is_customer := (auth.uid() = v_entry.customer_id);

    -- Caller authorization check
    IF NOT (v_is_admin OR v_is_staff OR v_is_owner OR v_is_customer) THEN
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

    -- Check direct token matches
    IF NOT v_token_matched THEN
        IF v_entry.qr_code_token::text = v_token_clean THEN
            v_token_matched := true;
        -- Staff, owner, or admin can verify using queue number or partial token
        ELSIF (v_is_staff OR v_is_owner OR v_is_admin) THEN
            IF v_entry.queue_number::text = v_token_clean
               OR (length(v_token_clean) >= 4 AND v_entry.qr_code_token::text ILIKE ('%' || v_token_clean || '%'))
            THEN
                v_token_matched := true;
            END IF;
        END IF;
    END IF;

    IF NOT v_token_matched THEN
        IF v_is_customer THEN
            RAISE EXCEPTION 'Invalid check-in QR code. Please scan the official QR code displayed at the barbershop.';
        ELSE
            RAISE EXCEPTION 'Invalid check-in QR code or token for Ticket #%.', v_entry.queue_number;
        END IF;
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

REVOKE ALL ON FUNCTION public.verify_qr_checkin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_qr_checkin(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. SEC-07: Concurrency & Chair Capacity Guard (start_service_atomic)
-- ============================================================================

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

    SELECT COUNT(*) INTO v_barber_count FROM public.barbers WHERE shop_id = v_shop_id AND is_active = true;

    -- Check chair / barber conflict
    IF p_barber_id IS NOT NULL THEN
        -- Verify selected barber belongs to this shop and is active
        IF NOT EXISTS (
            SELECT 1 FROM public.barbers 
            WHERE id = p_barber_id AND shop_id = v_shop_id AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected barber does not belong to this shop or is inactive.';
        END IF;

        SELECT COUNT(*) INTO v_existing_active_count
        FROM public.queue_entries
        WHERE shop_id = v_shop_id
          AND barber_id = p_barber_id
          AND status = 'in_service';
        
        IF v_existing_active_count > 0 THEN
            RAISE EXCEPTION 'This barber already has an active client in service.';
        END IF;
    ELSE
        -- If no specific barber specified, check overall shop chair capacity
        SELECT COUNT(*) INTO v_existing_active_count
        FROM public.queue_entries
        WHERE shop_id = v_shop_id
          AND status = 'in_service';

        IF v_existing_active_count >= GREATEST(v_barber_count, 1) THEN
            RAISE EXCEPTION 'All chairs in this shop are currently occupied with active clients.';
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

REVOKE ALL ON FUNCTION public.start_service_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_service_atomic(UUID, UUID) TO authenticated, service_role;

-- ============================================================================
-- 5. SEC-05: Restrict Audit Log Direct Insert Permissions
-- ============================================================================

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
FOR INSERT WITH CHECK (
    public.is_admin()
);

-- ============================================================================
-- 6. Missing Performance Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_support_tickets_shop_status ON public.support_tickets(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_entries_wait_calc ON public.queue_entries(shop_id, status, created_at);
