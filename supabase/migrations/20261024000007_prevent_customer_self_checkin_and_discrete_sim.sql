-- QuickCut Platform - Phase D: Critical QR Security & Discrete Multi-Server Wait-Time Simulation
-- Migration: 20261024000007_prevent_customer_self_checkin_and_discrete_sim.sql
-- Fixes:
-- 1. TASK 1: Prevent customer self-check-in (strictly require staff, owner, or admin role)
-- 2. TASK 4: Correct discrete multi-barber wait-time simulation (eliminated double counting, greedy dispatch, zero-barber handling)

-- ============================================================================
-- 1. TASK 1: Hardened verify_qr_checkin() RPC (No Customer Self-Check-in)
-- ============================================================================
-- Explicitly revokes customer self-verification. Even if an authenticated customer
-- submits their own valid cryptographic ticket token, check-in is rejected with
-- an Unauthorized permission error. Physical arrival must be verified by shop personnel.

CREATE OR REPLACE FUNCTION public.verify_qr_checkin(
    p_entry_id UUID,
    p_qr_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_shop_tz TEXT;
    v_current_local_date DATE;
    v_is_staff BOOLEAN;
    v_is_owner BOOLEAN;
    v_is_admin BOOLEAN;
    v_is_service_role BOOLEAN;
    v_token_clean TEXT;
    v_json_payload JSONB;
    v_token_matched BOOLEAN := false;
BEGIN
    -- Acquire row-level lock on the target queue entry
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue entry ticket not found.';
    END IF;

    -- Fetch shop timezone and local calendar date
    SELECT COALESCE(timezone, 'Asia/Kolkata') INTO v_shop_tz
    FROM public.shops WHERE id = v_entry.shop_id;
    v_current_local_date := (timezone(v_shop_tz, now()))::DATE;

    -- Strict Authorisation Model:
    -- ONLY authorized shop staff, verified shop owner, platform administrator,
    -- or trusted service role may perform check-in.
    -- Customers (including the ticket holder) are NEVER authorized to verify themselves.
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role');
    v_is_admin := public.is_admin();
    v_is_staff := public.is_shop_staff(v_entry.shop_id);
    v_is_owner := public.is_shop_owner(v_entry.shop_id);

    IF NOT (v_is_service_role OR v_is_admin OR v_is_staff OR v_is_owner) THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized shop staff, shop owners, or platform administrators can verify arrival check-in.';
    END IF;

    -- Expiration check: Ticket must be for current local date and within 24 hours
    IF v_entry.queue_date < v_current_local_date OR v_entry.created_at < (now() - INTERVAL '24 hours') THEN
        RAISE EXCEPTION 'This check-in QR code has expired and cannot be used.';
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

    -- Status guard: Entry must be in waiting status
    IF v_entry.status != 'waiting' THEN
        RAISE EXCEPTION 'This queue ticket cannot be checked in because it is no longer in waiting status.';
    END IF;

    v_token_clean := TRIM(p_qr_token);
    IF v_token_clean = '' THEN
        RAISE EXCEPTION 'Check-in token cannot be empty.';
    END IF;

    -- Cryptographic QR verification:
    -- 1. Check if token is JSON payload from generateQueueQRPayload
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

    -- 2. Check direct cryptographic random token match (UUID)
    IF NOT v_token_matched THEN
        IF v_entry.qr_code_token::text = v_token_clean THEN
            v_token_matched := true;
        END IF;
    END IF;

    -- Strictly reject queue number, partial match, or shop ID as proof of authenticity
    IF NOT v_token_matched THEN
        RAISE EXCEPTION 'Invalid check-in QR code or token. Cryptographic QR proof of arrival required.';
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
-- 2. TASK 4: Discrete Multi-Server Wait-Time Simulation (get_estimated_wait_time)
-- ============================================================================
-- Synchronized with TypeScript shared utility calculateEstimatedWaitTime().
-- Models each active barber as an independent server channel with in-chair elapsed
-- service deduction, dedicated barber lines, and greedy dispatch for unassigned entries.

CREATE OR REPLACE FUNCTION public.get_estimated_wait_time(target_queue_entry_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_target_barber_id UUID;
    v_created_at TIMESTAMPTZ;
    v_status queue_status;
    v_active_barber_count INTEGER := 0;
    v_people_ahead INTEGER := 0;
    v_estimated_minutes INTEGER := 0;
    
    -- Discrete server channel arrays
    v_barber_ids UUID[];
    v_timelines INTEGER[];
    v_num_channels INTEGER := 0;
    
    v_rec RECORD;
    v_rem INTEGER;
    v_idx INTEGER;
    v_min_idx INTEGER;
    v_min_val INTEGER;
    v_target_channel_found BOOLEAN := false;
BEGIN
    -- 1. Load target queue entry
    SELECT shop_id, barber_id, created_at, status
    INTO v_shop_id, v_target_barber_id, v_created_at, v_status
    FROM public.queue_entries
    WHERE id = target_queue_entry_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'estimated_minutes', 0,
            'people_ahead', 0,
            'active_barbers', 0,
            'status', 'not_found',
            'is_estimate', true,
            'disclaimer', 'Queue entry not found.'
        );
    END IF;

    IF v_status != 'waiting' THEN
        RETURN jsonb_build_object(
            'estimated_minutes', 0,
            'people_ahead', 0,
            'active_barbers', 0,
            'status', v_status,
            'is_estimate', true,
            'disclaimer', 'Entry is no longer waiting in line.'
        );
    END IF;

    -- 2. Fetch active barbers for this shop
    SELECT array_agg(id)
    INTO v_barber_ids
    FROM public.barbers
    WHERE shop_id = v_shop_id AND is_active = true;

    v_num_channels := COALESCE(array_length(v_barber_ids, 1), 0);
    v_active_barber_count := v_num_channels;

    -- Edge case: Zero active barbers
    IF v_active_barber_count = 0 THEN
        -- Count waiting people ahead regardless of barber availability
        SELECT COUNT(*)
        INTO v_people_ahead
        FROM public.queue_entries
        WHERE shop_id = v_shop_id
          AND status = 'waiting'
          AND (created_at < v_created_at OR (created_at = v_created_at AND id < target_queue_entry_id));

        RETURN jsonb_build_object(
            'estimated_minutes', -1,
            'people_ahead', v_people_ahead,
            'active_barbers', 0,
            'status', 'no_active_barbers',
            'is_estimate', true,
            'disclaimer', 'No active barbers are currently available at this shop.'
        );
    END IF;

    -- 3. Initialize server channel timelines to 0 minutes
    FOR i IN 1..v_num_channels LOOP
        v_timelines[i] := 0;
    END LOOP;

    -- 4. Step 1: Initialize barber availability from active in-service entries
    FOR v_rec IN
        SELECT 
            qe.id,
            qe.barber_id,
            qe.called_at,
            qe.created_at,
            COALESCE(s.avg_minutes, 20) AS avg_duration
        FROM public.queue_entries qe
        LEFT JOIN public.services s ON qe.service_id = s.id
        WHERE qe.shop_id = v_shop_id
          AND qe.status = 'in_service'
    LOOP
        -- Deduct elapsed service minutes
        v_rem := GREATEST(1, v_rec.avg_duration - FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(v_rec.called_at, v_rec.created_at))) / 60))::INTEGER);

        -- Match to designated barber channel if active
        v_idx := 0;
        IF v_rec.barber_id IS NOT NULL THEN
            FOR i IN 1..v_num_channels LOOP
                IF v_barber_ids[i] = v_rec.barber_id THEN
                    v_idx := i;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_idx > 0 THEN
            v_timelines[v_idx] := v_timelines[v_idx] + v_rem;
        ELSE
            -- In-service on unassigned or inactive barber: assign to channel with minimum current timeline
            v_min_idx := 1;
            v_min_val := v_timelines[1];
            FOR i IN 2..v_num_channels LOOP
                IF v_timelines[i] < v_min_val THEN
                    v_min_val := v_timelines[i];
                    v_min_idx := i;
                END IF;
            END LOOP;
            v_timelines[v_min_idx] := v_timelines[v_min_idx] + v_rem;
        END IF;
    END LOOP;

    -- 5. Step 2: Process waiting entries ahead in deterministic FIFO order
    FOR v_rec IN
        SELECT 
            qe.id,
            qe.barber_id,
            qe.queue_number,
            qe.created_at,
            COALESCE(s.avg_minutes, 20) AS avg_duration
        FROM public.queue_entries qe
        LEFT JOIN public.services s ON qe.service_id = s.id
        WHERE qe.shop_id = v_shop_id
          AND qe.status = 'waiting'
          AND (qe.created_at < v_created_at OR (qe.created_at = v_created_at AND qe.id < target_queue_entry_id))
        ORDER BY qe.created_at ASC, qe.queue_number ASC, qe.id ASC
    LOOP
        v_people_ahead := v_people_ahead + 1;

        -- If assigned to a specific active barber channel
        v_idx := 0;
        IF v_rec.barber_id IS NOT NULL THEN
            FOR i IN 1..v_num_channels LOOP
                IF v_barber_ids[i] = v_rec.barber_id THEN
                    v_idx := i;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_idx > 0 THEN
            v_timelines[v_idx] := v_timelines[v_idx] + v_rec.avg_duration;
        ELSE
            -- Unassigned waiting entry: greedy dispatch to barber with earliest availability
            v_min_idx := 1;
            v_min_val := v_timelines[1];
            FOR i IN 2..v_num_channels LOOP
                IF v_timelines[i] < v_min_val THEN
                    v_min_val := v_timelines[i];
                    v_min_idx := i;
                END IF;
            END LOOP;
            v_timelines[v_min_idx] := v_timelines[v_min_idx] + v_rec.avg_duration;
        END IF;
    END LOOP;

    -- 6. Step 3: Determine target wait time
    IF v_target_barber_id IS NOT NULL THEN
        FOR i IN 1..v_num_channels LOOP
            IF v_barber_ids[i] = v_target_barber_id THEN
                v_estimated_minutes := v_timelines[i];
                v_target_channel_found := true;
                EXIT;
            END IF;
        END LOOP;
        
        -- If target requested a barber that is not active, fallback to minimum timeline
        IF NOT v_target_channel_found THEN
            v_min_val := v_timelines[1];
            FOR i IN 2..v_num_channels LOOP
                IF v_timelines[i] < v_min_val THEN
                    v_min_val := v_timelines[i];
                END IF;
            END LOOP;
            v_estimated_minutes := v_min_val;
        END IF;
    ELSE
        -- Unassigned target takes earliest available barber
        v_min_val := v_timelines[1];
        FOR i IN 2..v_num_channels LOOP
            IF v_timelines[i] < v_min_val THEN
                v_min_val := v_timelines[i];
            END IF;
        END LOOP;
        v_estimated_minutes := v_min_val;
    END IF;

    RETURN jsonb_build_object(
        'estimated_minutes', GREATEST(0, v_estimated_minutes),
        'people_ahead', v_people_ahead,
        'active_barbers', v_active_barber_count,
        'status', 'waiting',
        'is_estimate', true,
        'disclaimer', 'Estimated wait is approximate and dynamically calculated based on queue progress and active barbers.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_estimated_wait_time(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_estimated_wait_time(UUID) TO authenticated, service_role;
