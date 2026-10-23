-- QuickCut Platform - Stage B: Authentication, Roles, RLS & Function Permissions
-- Migration: 20261023000002_security_auth_roles_rls.sql

-- 1. Ensure timezone column exists on shops
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 2. Hardened Helper Security Functions (Safe search_path)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()),
        'customer'::user_role
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_shop_owner(target_shop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = target_shop_id AND owner_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_shop_staff(target_shop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.shop_staff
        WHERE shop_id = target_shop_id AND user_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Hardened Automatic User Profile Creation on Signup (Prevent Self-Assigned Roles)
-- Public signups receive 'customer' role strictly. User metadata can NEVER grant privileged roles.
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
        -- Note: role is strictly NOT modified on conflict

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Trigger to Prevent Unauthorized Direct Role Changes on Profiles Table
CREATE OR REPLACE FUNCTION public.fn_prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Non-admins cannot insert any role other than customer
        IF NEW.role != 'customer' AND NOT public.is_admin() THEN
            NEW.role := 'customer'::user_role;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If role is changing, only a verified admin can authorize it
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF NOT public.is_admin() THEN
                RAISE EXCEPTION 'Unauthorized: Only platform administrators can change account roles.';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_profile_role_escalation();

-- 5. Automatic Role Promotion on Shop Approval & Staff Assignment
-- 5a. When admin approves a shop, promote owner profile to 'owner' role
CREATE OR REPLACE FUNCTION public.fn_handle_shop_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        UPDATE public.profiles
        SET role = 'owner'::user_role, updated_at = timezone('utc'::text, now())
        WHERE id = NEW.owner_id AND role = 'customer';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_handle_shop_status_change ON public.shops;
CREATE TRIGGER trg_handle_shop_status_change
AFTER UPDATE OF status ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.fn_handle_shop_status_change();

-- 5b. When a shop owner links staff, promote staff profile to 'staff' role
CREATE OR REPLACE FUNCTION public.fn_handle_staff_assignment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET role = 'staff'::user_role, updated_at = timezone('utc'::text, now())
    WHERE id = NEW.user_id AND role = 'customer';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_handle_staff_assignment ON public.shop_staff;
CREATE TRIGGER trg_handle_staff_assignment
AFTER INSERT ON public.shop_staff
FOR EACH ROW
EXECUTE FUNCTION public.fn_handle_staff_assignment();

-- 6. Super Admin RPC for Privileged User Role Updates
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

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', p_new_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. Hardened Row Level Security (RLS) Policies

-- 7a. Profiles Policies
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
    id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.queue_entries qe
        WHERE qe.customer_id = profiles.id
        AND (public.is_shop_owner(qe.shop_id) OR public.is_shop_staff(qe.shop_id))
    )
    OR role IN ('owner', 'staff')
);

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
    public.is_admin()
    OR (id = auth.uid() AND role = 'customer')
);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
    id = auth.uid() OR public.is_admin()
) WITH CHECK (
    public.is_admin()
    OR (
        id = auth.uid()
        AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
    )
);

-- 7b. Shops Policies
-- Support owner onboarding: Any authenticated user can create an unapproved ('pending') shop
DROP POLICY IF EXISTS "shops_insert_policy" ON public.shops;
CREATE POLICY "shops_insert_policy" ON public.shops
FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
        auth.uid() = owner_id
        AND status = 'pending'
    )
);

-- Owners and staff can update operational details, but NEVER self-approve
DROP POLICY IF EXISTS "shops_update_policy" ON public.shops;
CREATE POLICY "shops_update_policy" ON public.shops
FOR UPDATE USING (
    public.is_admin() OR owner_id = auth.uid() OR public.is_shop_staff(id)
) WITH CHECK (
    public.is_admin()
    OR (
        owner_id = auth.uid()
        -- Regular owners cannot change their shop approval status
        AND status = (SELECT s.status FROM public.shops s WHERE s.id = shops.id)
        AND owner_id = (SELECT s.owner_id FROM public.shops s WHERE s.id = shops.id)
    )
    OR (
        public.is_shop_staff(id)
        -- Staff can only toggle operational fields like is_queue_paused
        AND status = (SELECT s.status FROM public.shops s WHERE s.id = shops.id)
        AND owner_id = (SELECT s.owner_id FROM public.shops s WHERE s.id = shops.id)
    )
);

-- 7c. Queue Entries Policies
-- Customer can ONLY insert for themselves in approved shops
DROP POLICY IF EXISTS "queue_entries_insert_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_insert_policy" ON public.queue_entries
FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
        customer_id = auth.uid()
        AND is_walkin = false
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = queue_entries.shop_id AND s.status = 'approved')
    )
    OR (
        (public.is_shop_owner(shop_id) OR public.is_shop_staff(shop_id))
        AND is_walkin = true
        AND customer_id IS NULL
    )
);

-- 7d. Payments Policies: Owners cannot insert or modify payment records directly
DROP POLICY IF EXISTS "payments_insert_policy" ON public.payments;
CREATE POLICY "payments_insert_policy" ON public.payments
FOR INSERT WITH CHECK (
    public.is_admin()
);

DROP POLICY IF EXISTS "payments_update_policy" ON public.payments;
CREATE POLICY "payments_update_policy" ON public.payments
FOR UPDATE USING (
    public.is_admin()
);

DROP POLICY IF EXISTS "payments_delete_policy" ON public.payments;
CREATE POLICY "payments_delete_policy" ON public.payments
FOR DELETE USING (
    public.is_admin()
);

-- 8. Restrict Function Permissions (Least Privilege)
REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, user_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_shop_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_shop_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_shop_staff(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated, service_role;
