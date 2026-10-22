-- QuickCut Platform - Initial Schema
-- Migration: 20261022000001_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'staff', 'owner', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE shop_status AS ENUM ('pending', 'approved', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE queue_status AS ENUM ('waiting', 'in_service', 'completed', 'cancelled', 'no_show');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE fee_status AS ENUM ('pending', 'paid', 'disputed', 'waived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Profiles Table (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'customer',
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Shops Table
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status shop_status NOT NULL DEFAULT 'pending',
    opening_time TIME NOT NULL DEFAULT '09:00:00',
    closing_time TIME NOT NULL DEFAULT '21:00:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Shop Staff Table (Maps staff profiles to shops)
CREATE TABLE IF NOT EXISTS public.shop_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'barber',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_shop_staff UNIQUE (shop_id, user_id)
);

-- 4. Barbers Table (Barber chairs / personnel in shop)
CREATE TABLE IF NOT EXISTS public.barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Services Table
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    avg_minutes INTEGER NOT NULL CHECK (avg_minutes > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Queue Entries Table
CREATE TABLE IF NOT EXISTS public.queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    barber_id UUID REFERENCES public.barbers(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    guest_name TEXT,
    guest_phone TEXT,
    queue_number INTEGER NOT NULL,
    status queue_status NOT NULL DEFAULT 'waiting',
    qr_code_token UUID NOT NULL DEFAULT gen_random_uuid(),
    checked_in_at TIMESTAMPTZ,
    called_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    is_walkin BOOLEAN NOT NULL DEFAULT false,
    is_billable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Fee Records Table
CREATE TABLE IF NOT EXISTS public.fee_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    month TEXT NOT NULL, -- Format: YYYY-MM
    billable_count INTEGER NOT NULL DEFAULT 0 CHECK (billable_count >= 0),
    rate_per_service NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    status fee_status NOT NULL DEFAULT 'pending',
    disputed_until TIMESTAMPTZ NOT NULL,
    dispute_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_shop_fee_month UNIQUE (shop_id, month)
);

-- 8. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_record_id UUID REFERENCES public.fee_records(id) ON DELETE SET NULL,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'completed',
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    transaction_ref TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'queue_update',
    read BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. Support Tickets Table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status ticket_status NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shops_status ON public.shops(status);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shop_staff_shop ON public.shop_staff(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_staff_user ON public.shop_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_barbers_shop ON public.barbers(shop_id);
CREATE INDEX IF NOT EXISTS idx_services_shop ON public.services(shop_id);
CREATE INDEX IF NOT EXISTS idx_queue_entries_shop_status ON public.queue_entries(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_customer ON public.queue_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_queue_entries_token ON public.queue_entries(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_fee_records_shop ON public.fee_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_payments_shop ON public.payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);

-- Enable Realtime for live queue updates and notifications (Idempotent)
DO $$ 
DECLARE
    tbl text;
BEGIN
    FOR tbl IN VALUES ('queue_entries'), ('notifications'), ('shops') LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
        END IF;
    END LOOP;
END $$;
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
-- QuickCut Platform - Seed Script
-- File: supabase/seed.sql

-- Safe cleanup for fresh seed
TRUNCATE TABLE public.audit_logs CASCADE;
TRUNCATE TABLE public.support_tickets CASCADE;
TRUNCATE TABLE public.notifications CASCADE;
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.fee_records CASCADE;
TRUNCATE TABLE public.queue_entries CASCADE;
TRUNCATE TABLE public.services CASCADE;
TRUNCATE TABLE public.barbers CASCADE;
TRUNCATE TABLE public.shop_staff CASCADE;
TRUNCATE TABLE public.shops CASCADE;
TRUNCATE TABLE public.profiles CASCADE;

-- 1. Create Auth Users (Pre-registered test accounts with password: Password123!)
-- Admin
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Platform Administrator","role":"admin"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Owner
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'owner.alex@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex Miller","role":"owner"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Staff
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'staff.sam@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sam Wilson","role":"staff"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Customer 1
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'customer.rahul@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Rahul Sharma","role":"customer"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Customer 2
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'customer.priya@quickcut.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Priya Patel","role":"customer"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- Ensure auth.identities are mapped for all seeded users
INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
SELECT 
    id, id as user_id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email' as provider,
    id::text as provider_id,
    now(), now(), now()
FROM auth.users
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 2. Insert Profiles (Mapped to above auth.users)
-- Admin
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin',
    'Platform Administrator',
    '+91 98765 00001',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Shop Owner: Alex Miller
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'owner',
    'Alex Miller',
    '+91 98765 00002',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Staff: Sam Barber
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'staff',
    'Sam Wilson',
    '+91 98765 00003',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Customer 1: Rahul Sharma
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000004',
    'customer',
    'Rahul Sharma',
    '+91 98765 00004',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Customer 2: Priya Patel
INSERT INTO public.profiles (id, role, full_name, phone, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000005',
    'customer',
    'Priya Patel',
    '+91 98765 00005',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Insert Shops
-- 1. Crown & Blade Barbershop (Approved)
INSERT INTO public.shops (id, owner_id, name, address, phone, latitude, longitude, status, opening_time, closing_time)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Crown & Blade Barbershop',
    '42 Brigade Road, Indiranagar, Bengaluru',
    '+91 80 4123 4567',
    12.9716,
    77.5946,
    'approved',
    '09:00:00',
    '21:00:00'
);

-- 2. Urban Fades Lounge (Pending Admin Approval)
INSERT INTO public.shops (id, owner_id, name, address, phone, latitude, longitude, status, opening_time, closing_time)
VALUES (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Urban Fades Lounge',
    '18 Koramangala 5th Block, Bengaluru',
    '+91 80 4987 6543',
    12.9352,
    77.6245,
    'pending',
    '10:00:00',
    '22:00:00'
);

-- Insert Staff Assignment
INSERT INTO public.shop_staff (id, shop_id, user_id, role)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'senior_barber'
);

-- Insert Barbers / Chairs
INSERT INTO public.barbers (id, shop_id, user_id, name, is_active)
VALUES 
(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'Sam Wilson (Master Stylist)',
    true
),
(
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'Leo Gomez (Fade Specialist)',
    true
),
(
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'Marco Rossi (Beard Artist)',
    true
);

-- Insert Services
INSERT INTO public.services (id, shop_id, name, price, avg_minutes, is_active)
VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Classic Haircut & Styling',
    350.00,
    25,
    true
),
(
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Beard Sculpting & Hot Towel',
    200.00,
    15,
    true
),
(
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'The Executive Royal Package (Hair + Beard + Wash)',
    650.00,
    45,
    true
);

-- Insert Queue Entries demonstrating logic:
-- 1. In Service entry (Rahul Sharma, Classic Haircut = 25 mins)
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, queue_number, status, 
    qr_code_token, checked_in_at, called_at, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    101,
    'in_service',
    'a1111111-1111-1111-1111-111111111111',
    timezone('utc'::text, now() - INTERVAL '15 minutes'),
    timezone('utc'::text, now() - INTERVAL '10 minutes'),
    false,
    timezone('utc'::text, now() - INTERVAL '30 minutes')
);

-- 2. Waiting entry (Priya Patel, Beard/Trim = 15 mins). 
-- Wait time will be calculated dynamically based on entries ahead!
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, queue_number, status, 
    qr_code_token, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    102,
    'waiting',
    'b2222222-2222-2222-2222-222222222222',
    false,
    timezone('utc'::text, now() - INTERVAL '10 minutes')
);

-- 3. Billable Completed entry (Customer QR Check-in + Staff Completion + Not Walkin)
-- Trigger will automatically compute is_billable = true!
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, queue_number, status, 
    qr_code_token, checked_in_at, called_at, completed_at, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    99,
    'completed',
    'c3333333-3333-3333-3333-333333333333',
    timezone('utc'::text, now() - INTERVAL '2 hours'),
    timezone('utc'::text, now() - INTERVAL '1 hour 45 minutes'),
    timezone('utc'::text, now() - INTERVAL '1 hour 20 minutes'),
    false,
    timezone('utc'::text, now() - INTERVAL '2 hours 15 minutes')
);

-- 4. Completed Walk-In entry (Should NOT be billable: is_walkin = true)
INSERT INTO public.queue_entries (
    id, shop_id, customer_id, barber_id, service_id, guest_name, queue_number, status, 
    qr_code_token, completed_at, is_walkin, created_at
)
VALUES (
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    '30000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000002',
    'Walk-in Guest Dev',
    100,
    'completed',
    'd4444444-4444-4444-4444-444444444444',
    timezone('utc'::text, now() - INTERVAL '40 minutes'),
    true,
    timezone('utc'::text, now() - INTERVAL '1 hour')
);

-- Insert Fee Record for Shop (Demonstrates Rs 5 per billable service)
INSERT INTO public.fee_records (
    id, shop_id, month, billable_count, rate_per_service, amount, status, disputed_until, dispute_reason
)
VALUES (
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    to_char(timezone('utc'::text, now()), 'YYYY-MM'),
    148,
    5.00,
    740.00, -- 148 * Rs 5
    'pending',
    timezone('utc'::text, now() + INTERVAL '5 days'),
    NULL
);

-- Insert Sample Payment
INSERT INTO public.payments (
    id, fee_record_id, shop_id, amount, currency, status, payment_method, transaction_ref, paid_at
)
VALUES (
    '70000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    740.00,
    'INR',
    'completed',
    'UPI',
    'UPI/20261022/984719284',
    timezone('utc'::text, now() - INTERVAL '1 day')
);

-- Insert Notifications
INSERT INTO public.notifications (user_id, title, message, type, read)
VALUES 
(
    '00000000-0000-0000-0000-000000000004',
    'Your Turn is Approaching!',
    'Crown & Blade Barbershop: Sam Wilson is ready to welcome you shortly.',
    'queue_update',
    false
),
(
    '00000000-0000-0000-0000-000000000002',
    'Monthly Fee Statement Ready',
    'Your billing statement for this month has been generated: Rs 740.00 (148 billable cuts @ Rs 5/service).',
    'billing',
    false
);

-- Insert Support Ticket
INSERT INTO public.support_tickets (user_id, shop_id, subject, message, status, priority)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Inquiry about QR Scanner Hardware Support',
    'We are planning to add a fixed tablet scanner at our entrance. Does the staff app support continuous camera scan mode?',
    'open',
    'medium'
);

-- Insert Audit Log
INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, payload)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'SHOP_APPROVED',
    'shops',
    '10000000-0000-0000-0000-000000000001',
    '{"shop_name": "Crown & Blade Barbershop", "reviewer": "admin"}'::jsonb
);
