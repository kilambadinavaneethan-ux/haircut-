-- QuickCut Platform - Fix Profile Role Escalation Trigger for Internal Workflows & Admin Superuser
-- Migration: 20261023000005_fix_role_escalation_trigger.sql

-- 1. Hardened Trigger to Prevent Unauthorized Direct Role Changes while allowing trusted internal triggers & superuser
CREATE OR REPLACE FUNCTION public.fn_prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_is_internal BOOLEAN;
    v_is_db_admin BOOLEAN;
BEGIN
    -- Check if this change originates from a trusted internal trigger or admin RPC
    v_is_internal := (current_setting('quickcut.internal_role_change', true) = 'true');

    -- Check if running via SQL console, migrations, postgres superuser, or service_role
    v_is_db_admin := (
        auth.uid() IS NULL 
        OR current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
    );

    IF TG_OP = 'INSERT' THEN
        -- Non-admins cannot insert any role other than customer
        IF NEW.role != 'customer' AND NOT (v_is_internal OR v_is_db_admin OR public.is_admin()) THEN
            NEW.role := 'customer'::user_role;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If role is changing, only authorized callers or internal workflows can modify it
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF NOT (v_is_internal OR v_is_db_admin OR public.is_admin()) THEN
                RAISE EXCEPTION 'Unauthorized: Only platform administrators can change account roles.';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Ensure internal triggers set local context flag
CREATE OR REPLACE FUNCTION public.fn_handle_shop_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        PERFORM set_config('quickcut.internal_role_change', 'true', true);
        UPDATE public.profiles
        SET role = 'owner'::user_role, updated_at = timezone('utc'::text, now())
        WHERE id = NEW.owner_id AND role = 'customer';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.fn_handle_staff_assignment()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM set_config('quickcut.internal_role_change', 'true', true);
    UPDATE public.profiles
    SET role = 'staff'::user_role, updated_at = timezone('utc'::text, now())
    WHERE id = NEW.user_id AND role = 'customer';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
    p_user_id UUID,
    p_new_role user_role
)
RETURNS JSONB AS $$
DECLARE
    v_old_role user_role;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Super Admin privileges required.';
    END IF;

    SELECT role INTO v_old_role FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;

    PERFORM set_config('quickcut.internal_role_change', 'true', true);

    UPDATE public.profiles
    SET role = p_new_role, updated_at = timezone('utc'::text, now())
    WHERE id = p_user_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, payload)
    VALUES (
        auth.uid(),
        'ADMIN_SET_ROLE',
        'profiles',
        p_user_id::text,
        jsonb_build_object('old_role', v_old_role, 'new_role', p_new_role)
    );

    RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'new_role', p_new_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
