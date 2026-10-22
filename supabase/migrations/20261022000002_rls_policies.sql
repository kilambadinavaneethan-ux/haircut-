-- QuickCut Platform - Row Level Security (RLS) Policies
-- Migration: 20261022000002_rls_policies.sql

-- Enable RLS on all 11 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper security functions
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_shop_owner(target_shop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = target_shop_id AND owner_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_shop_staff(target_shop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.shop_staff
        WHERE shop_id = target_shop_id AND user_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =========================================================================
-- 1. Profiles Policies
-- =========================================================================
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
    id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
        -- Shop staff/owner can view customer profiles who have queue entries in their shop
        SELECT 1 FROM public.queue_entries qe
        WHERE qe.customer_id = profiles.id
        AND (public.is_shop_owner(qe.shop_id) OR public.is_shop_staff(qe.shop_id))
    )
    OR role IN ('owner', 'staff') -- Basic visibility of providers
);

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
    id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
    id = auth.uid() OR public.is_admin()
) WITH CHECK (
    (id = auth.uid() AND (role = public.current_user_role() OR public.is_admin()))
    OR public.is_admin()
);

-- =========================================================================
-- 2. Shops Policies
-- =========================================================================
DROP POLICY IF EXISTS "shops_select_policy" ON public.shops;
CREATE POLICY "shops_select_policy" ON public.shops
FOR SELECT USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR public.is_shop_staff(id)
    OR status = 'approved'
);

DROP POLICY IF EXISTS "shops_insert_policy" ON public.shops;
CREATE POLICY "shops_insert_policy" ON public.shops
FOR INSERT WITH CHECK (
    public.is_admin() OR (auth.uid() = owner_id AND public.current_user_role() = 'owner')
);

DROP POLICY IF EXISTS "shops_update_policy" ON public.shops;
CREATE POLICY "shops_update_policy" ON public.shops
FOR UPDATE USING (
    public.is_admin() OR owner_id = auth.uid()
) WITH CHECK (
    public.is_admin()
    OR (
        owner_id = auth.uid()
        -- Regular owners cannot unilaterally change their own status to 'approved'
        AND (status = (SELECT s.status FROM public.shops s WHERE s.id = shops.id))
    )
);

DROP POLICY IF EXISTS "shops_delete_policy" ON public.shops;
CREATE POLICY "shops_delete_policy" ON public.shops
FOR DELETE USING (
    public.is_admin() OR owner_id = auth.uid()
);

-- =========================================================================
-- 3. Shop Staff Policies
-- =========================================================================
DROP POLICY IF EXISTS "shop_staff_select_policy" ON public.shop_staff;
CREATE POLICY "shop_staff_select_policy" ON public.shop_staff
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR user_id = auth.uid()
    OR public.is_shop_staff(shop_id)
);

DROP POLICY IF EXISTS "shop_staff_insert_policy" ON public.shop_staff;
CREATE POLICY "shop_staff_insert_policy" ON public.shop_staff
FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "shop_staff_update_policy" ON public.shop_staff;
CREATE POLICY "shop_staff_update_policy" ON public.shop_staff
FOR UPDATE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "shop_staff_delete_policy" ON public.shop_staff;
CREATE POLICY "shop_staff_delete_policy" ON public.shop_staff
FOR DELETE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

-- =========================================================================
-- 4. Barbers Policies
-- =========================================================================
DROP POLICY IF EXISTS "barbers_select_policy" ON public.barbers;
CREATE POLICY "barbers_select_policy" ON public.barbers
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR (
        is_active = true
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = barbers.shop_id AND s.status = 'approved')
    )
);

DROP POLICY IF EXISTS "barbers_insert_policy" ON public.barbers;
CREATE POLICY "barbers_insert_policy" ON public.barbers
FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "barbers_update_policy" ON public.barbers;
CREATE POLICY "barbers_update_policy" ON public.barbers
FOR UPDATE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "barbers_delete_policy" ON public.barbers;
CREATE POLICY "barbers_delete_policy" ON public.barbers
FOR DELETE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

-- =========================================================================
-- 5. Services Policies
-- =========================================================================
DROP POLICY IF EXISTS "services_select_policy" ON public.services;
CREATE POLICY "services_select_policy" ON public.services
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR (
        is_active = true
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = services.shop_id AND s.status = 'approved')
    )
);

DROP POLICY IF EXISTS "services_insert_policy" ON public.services;
CREATE POLICY "services_insert_policy" ON public.services
FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "services_update_policy" ON public.services;
CREATE POLICY "services_update_policy" ON public.services
FOR UPDATE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "services_delete_policy" ON public.services;
CREATE POLICY "services_delete_policy" ON public.services
FOR DELETE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

-- =========================================================================
-- 6. Queue Entries Policies
-- Customers see only their own data; staff only assigned shop; owner only their shop; admin everything.
-- =========================================================================
DROP POLICY IF EXISTS "queue_entries_select_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_select_policy" ON public.queue_entries
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR customer_id = auth.uid()
);

DROP POLICY IF EXISTS "queue_entries_insert_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_insert_policy" ON public.queue_entries
FOR INSERT WITH CHECK (
    public.is_admin()
    OR (customer_id = auth.uid() AND is_walkin = false)
    OR ((public.is_shop_owner(shop_id) OR public.is_shop_staff(shop_id)) AND is_walkin = true)
);

DROP POLICY IF EXISTS "queue_entries_update_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_update_policy" ON public.queue_entries
FOR UPDATE USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR (customer_id = auth.uid() AND status = 'waiting')
) WITH CHECK (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR (customer_id = auth.uid() AND status IN ('waiting', 'cancelled'))
);

DROP POLICY IF EXISTS "queue_entries_delete_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_delete_policy" ON public.queue_entries
FOR DELETE USING (
    public.is_admin()
);

-- =========================================================================
-- 7. Fee Records Policies
-- =========================================================================
DROP POLICY IF EXISTS "fee_records_select_policy" ON public.fee_records;
CREATE POLICY "fee_records_select_policy" ON public.fee_records
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "fee_records_insert_policy" ON public.fee_records;
CREATE POLICY "fee_records_insert_policy" ON public.fee_records
FOR INSERT WITH CHECK (
    public.is_admin()
);

DROP POLICY IF EXISTS "fee_records_update_policy" ON public.fee_records;
CREATE POLICY "fee_records_update_policy" ON public.fee_records
FOR UPDATE USING (
    public.is_admin()
    OR (
        public.is_shop_owner(shop_id)
        AND timezone('utc'::text, now()) <= disputed_until
    )
) WITH CHECK (
    public.is_admin()
    OR (
        public.is_shop_owner(shop_id)
        AND timezone('utc'::text, now()) <= disputed_until
        AND status = 'disputed'
    )
);

-- =========================================================================
-- 8. Payments Policies
-- =========================================================================
DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
CREATE POLICY "payments_select_policy" ON public.payments
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "payments_insert_policy" ON public.payments;
CREATE POLICY "payments_insert_policy" ON public.payments
FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

-- =========================================================================
-- 9. Notifications Policies
-- =========================================================================
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
CREATE POLICY "notifications_select_policy" ON public.notifications
FOR SELECT USING (
    public.is_admin() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
CREATE POLICY "notifications_update_policy" ON public.notifications
FOR UPDATE USING (
    public.is_admin() OR user_id = auth.uid()
) WITH CHECK (
    public.is_admin() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;
CREATE POLICY "notifications_delete_policy" ON public.notifications
FOR DELETE USING (
    public.is_admin() OR user_id = auth.uid()
);

-- =========================================================================
-- 10. Support Tickets Policies
-- =========================================================================
DROP POLICY IF EXISTS "support_tickets_select_policy" ON public.support_tickets;
CREATE POLICY "support_tickets_select_policy" ON public.support_tickets
FOR SELECT USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR (shop_id IS NOT NULL AND public.is_shop_owner(shop_id))
);

DROP POLICY IF EXISTS "support_tickets_insert_policy" ON public.support_tickets;
CREATE POLICY "support_tickets_insert_policy" ON public.support_tickets
FOR INSERT WITH CHECK (
    public.is_admin() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "support_tickets_update_policy" ON public.support_tickets;
CREATE POLICY "support_tickets_update_policy" ON public.support_tickets
FOR UPDATE USING (
    public.is_admin() OR (user_id = auth.uid() AND status = 'open')
);

-- =========================================================================
-- 11. Audit Logs Policies
-- =========================================================================
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
FOR SELECT USING (
    public.is_admin()
    OR (
        user_id = auth.uid()
    )
    OR (
        entity_type = 'shops'
        AND EXISTS (SELECT 1 FROM public.shops WHERE id::text = audit_logs.entity_id AND owner_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' OR public.is_admin()
);
