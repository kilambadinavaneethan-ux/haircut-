-- ============================================================================
-- Migration: 20261024000006_refined_wait_time_simulation.sql
-- Description: Refines get_estimated_wait_time() to accurately model discrete
-- barber workloads, requested barber chair queues, remaining service progress,
-- and greedy dispatch for unassigned pool entries.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_estimated_wait_time(target_queue_entry_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_target_barber_id UUID;
    v_created_at TIMESTAMPTZ;
    v_status queue_status;
    v_active_barber_count INTEGER := 1;
    v_estimated_minutes INTEGER := 0;
    v_people_ahead INTEGER := 0;
    v_has_specific_assignments BOOLEAN := false;
    v_total_pool_minutes NUMERIC := 0;
    v_target_barber_minutes NUMERIC := 0;
    v_min_barber_minutes NUMERIC := 0;
BEGIN
    SELECT shop_id, barber_id, created_at, status
    INTO v_shop_id, v_target_barber_id, v_created_at, v_status
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
    INTO v_active_barber_count
    FROM public.barbers
    WHERE shop_id = v_shop_id AND is_active = true;

    -- Check if target or any preceding active entry has a specific barber assignment
    v_has_specific_assignments := (v_target_barber_id IS NOT NULL) OR EXISTS (
        SELECT 1 
        FROM public.queue_entries 
        WHERE shop_id = v_shop_id 
          AND status IN ('in_service', 'waiting') 
          AND barber_id IS NOT NULL
    );

    IF v_has_specific_assignments THEN
        -- Case A: Target has a requested barber
        IF v_target_barber_id IS NOT NULL THEN
            -- In-service on target barber chair (remaining time)
            SELECT COALESCE(SUM(
                GREATEST(1, s.avg_minutes - FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(qe.called_at, qe.created_at))) / 60))
            ), 0)
            INTO v_target_barber_minutes
            FROM public.queue_entries qe
            JOIN public.services s ON qe.service_id = s.id
            WHERE qe.shop_id = v_shop_id
              AND qe.status = 'in_service'
              AND qe.barber_id = v_target_barber_id;

            -- Waiting entries ahead explicitly assigned to target barber
            SELECT v_target_barber_minutes + COALESCE(SUM(s.avg_minutes), 0),
                   COUNT(qe.id)
            INTO v_target_barber_minutes, v_people_ahead
            FROM public.queue_entries qe
            JOIN public.services s ON qe.service_id = s.id
            WHERE qe.shop_id = v_shop_id
              AND qe.status = 'waiting'
              AND qe.created_at < v_created_at
              AND qe.barber_id = v_target_barber_id;

            -- Add distributed unassigned pool entries ahead
            SELECT v_target_barber_minutes + CEIL(COALESCE(SUM(s.avg_minutes), 0) / v_active_barber_count)
            INTO v_target_barber_minutes
            FROM public.queue_entries qe
            JOIN public.services s ON qe.service_id = s.id
            WHERE qe.shop_id = v_shop_id
              AND qe.status = 'waiting'
              AND qe.created_at < v_created_at
              AND qe.barber_id IS NULL;

            v_estimated_minutes := v_target_barber_minutes::INTEGER;
        ELSE
            -- Case B: Target is unassigned, but individual barber queues exist
            -- Target gets served by whichever barber finishes first (min workload)
            WITH barber_workloads AS (
                SELECT 
                    b.id AS barber_id,
                    COALESCE(SUM(
                        CASE 
                            WHEN qe.status = 'in_service' THEN GREATEST(1, s.avg_minutes - FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(qe.called_at, qe.created_at))) / 60))
                            WHEN qe.status = 'waiting' AND qe.created_at < v_created_at THEN s.avg_minutes
                            ELSE 0
                        END
                    ), 0) AS total_minutes
                FROM public.barbers b
                LEFT JOIN public.queue_entries qe ON qe.barber_id = b.id AND qe.status IN ('in_service', 'waiting') AND (qe.status = 'in_service' OR qe.created_at < v_created_at)
                LEFT JOIN public.services s ON qe.service_id = s.id
                WHERE b.shop_id = v_shop_id AND b.is_active = true
                GROUP BY b.id
            )
            SELECT COALESCE(MIN(total_minutes), 0)
            INTO v_min_barber_minutes
            FROM barber_workloads;

            -- Also account for unassigned waiting entries ahead distributed across barbers
            SELECT v_min_barber_minutes + CEIL(COALESCE(SUM(s.avg_minutes), 0) / v_active_barber_count),
                   COUNT(qe.id)
            INTO v_estimated_minutes, v_people_ahead
            FROM public.queue_entries qe
            JOIN public.services s ON qe.service_id = s.id
            WHERE qe.shop_id = v_shop_id
              AND qe.status = 'waiting'
              AND qe.created_at < v_created_at;
        END IF;
    ELSE
        -- General shop pool (no specific barber assignments)
        -- 1. Duration for waiting customers ahead
        SELECT 
            COALESCE(SUM(s.avg_minutes), 0),
            COUNT(qe.id)
        INTO v_total_pool_minutes, v_people_ahead
        FROM public.queue_entries qe
        JOIN public.services s ON qe.service_id = s.id
        WHERE qe.shop_id = v_shop_id
          AND qe.status = 'waiting'
          AND qe.created_at < v_created_at;

        -- 2. Add remaining duration for active in-chair services (deducting elapsed time)
        SELECT v_total_pool_minutes + COALESCE(SUM(
            GREATEST(1, s.avg_minutes - FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(qe.called_at, qe.created_at))) / 60))
        ), 0)
        INTO v_total_pool_minutes
        FROM public.queue_entries qe
        JOIN public.services s ON qe.service_id = s.id
        WHERE qe.shop_id = v_shop_id
          AND qe.status = 'in_service';

        -- 3. Divide across active parallel barbers
        v_estimated_minutes := CEIL(v_total_pool_minutes / v_active_barber_count);
    END IF;

    RETURN jsonb_build_object(
        'estimated_minutes', GREATEST(0, v_estimated_minutes),
        'people_ahead', v_people_ahead,
        'active_barbers', v_active_barber_count,
        'status', 'waiting',
        'is_estimate', true,
        'disclaimer', 'Wait times are dynamically computed estimates based on active barbers and queue progress. Actual wait times may vary depending on service complexity.'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_estimated_wait_time(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_estimated_wait_time(UUID) TO anon, authenticated, service_role;
