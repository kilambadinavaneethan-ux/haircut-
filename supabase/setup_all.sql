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
    rate_per_service NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
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
-- QuickCut operates at ₹0 platform fee. No queue entry is billable.
CREATE OR REPLACE FUNCTION public.fn_compute_queue_entry_billable()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_billable := false;
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

-- 6. Monthly Fee Aggregator Function (Deactivated - ₹0 Platform Fee Model)
CREATE OR REPLACE FUNCTION public.generate_monthly_fee_record(p_shop_id UUID, p_month TEXT)
RETURNS UUID AS $$
BEGIN
    -- QuickCut operates at ₹0 platform fee. No fee invoices are generated.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
-- QuickCut Platform - Seed Script
-- File: supabase/seed.sql

-- Security & Invariants Protection Triggers (Pre-seed definition)
CREATE OR REPLACE FUNCTION public.fn_prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Non-admins cannot insert any role other than customer
        IF NEW.role != 'customer' AND NOT (auth.uid() IS NULL OR public.is_admin()) THEN
            NEW.role := 'customer'::user_role;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If role is changing, only a verified platform administrator or superuser can authorize it
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF NOT (auth.uid() IS NULL OR public.is_admin()) THEN
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

CREATE OR REPLACE FUNCTION public.fn_handle_shop_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        IF auth.uid() IS NULL OR public.is_admin() THEN
            UPDATE public.profiles
            SET role = 'owner'::user_role, updated_at = timezone('utc'::text, now())
            WHERE id = NEW.owner_id AND role = 'customer';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_handle_shop_status_change ON public.shops;
CREATE TRIGGER trg_handle_shop_status_change
AFTER UPDATE OF status ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.fn_handle_shop_status_change();

-- Decouple staff assignment from mutating global profile role.
-- Staff access is shop-scoped via public.shop_staff and public.is_shop_staff(shop_id).
DROP TRIGGER IF EXISTS trg_handle_staff_assignment ON public.shop_staff;
DROP FUNCTION IF EXISTS public.fn_handle_staff_assignment();

-- Fix NULL token columns in auth.users by converting NULLs to empty strings ('')
-- Supabase GoTrue crashes scanning SQL NULL into Go string variables.
UPDATE auth.users 
SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    email_change = COALESCE(email_change, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, '');

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
) ON CONFLICT (id) DO UPDATE SET 
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    email_change_token_current = EXCLUDED.email_change_token_current,
    phone_change = EXCLUDED.phone_change,
    phone_change_token = EXCLUDED.phone_change_token,
    reauthentication_token = EXCLUDED.reauthentication_token;

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
) ON CONFLICT (id) DO UPDATE SET 
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    email_change_token_current = EXCLUDED.email_change_token_current,
    phone_change = EXCLUDED.phone_change,
    phone_change_token = EXCLUDED.phone_change_token,
    reauthentication_token = EXCLUDED.reauthentication_token;

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
) ON CONFLICT (id) DO UPDATE SET 
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    email_change_token_current = EXCLUDED.email_change_token_current,
    phone_change = EXCLUDED.phone_change,
    phone_change_token = EXCLUDED.phone_change_token,
    reauthentication_token = EXCLUDED.reauthentication_token;

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
) ON CONFLICT (id) DO UPDATE SET 
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    email_change_token_current = EXCLUDED.email_change_token_current,
    phone_change = EXCLUDED.phone_change,
    phone_change_token = EXCLUDED.phone_change_token,
    reauthentication_token = EXCLUDED.reauthentication_token;

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
) ON CONFLICT (id) DO UPDATE SET 
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    email_change_token_current = EXCLUDED.email_change_token_current,
    phone_change = EXCLUDED.phone_change,
    phone_change_token = EXCLUDED.phone_change_token,
    reauthentication_token = EXCLUDED.reauthentication_token;

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
) ON CONFLICT (id) DO NOTHING;

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
) ON CONFLICT (id) DO NOTHING;

-- Insert Staff Assignment
INSERT INTO public.shop_staff (id, shop_id, user_id, role)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'senior_barber'
) ON CONFLICT (id) DO NOTHING;

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
) ON CONFLICT (id) DO NOTHING;

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
) ON CONFLICT (id) DO NOTHING;

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
) ON CONFLICT (id) DO NOTHING;

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
) ON CONFLICT (id) DO NOTHING;

-- 3. Completed entry (Customer QR Check-in + Staff Completion + Not Walkin)
-- QuickCut operates at ₹0 platform fee. No service is billable.
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
) ON CONFLICT (id) DO NOTHING;

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
) ON CONFLICT (id) DO NOTHING;

-- Insert Fee Record for Shop (Demonstrates Rs 5 per billable service)
-- Insert Notifications
INSERT INTO public.notifications (user_id, title, message, type, read)
VALUES 
(
    '00000000-0000-0000-0000-000000000004',
    'Your Turn is Approaching!',
    'Crown & Blade Barbershop: Sam Wilson is ready to welcome you shortly.',
    'queue_update',
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

-- ==========================================================================
-- SECTION: SECURITY, INVARIANTS, CONCURRENCY & RPC HARDENING (MIGRATION 20261023000001)
-- ==========================================================================

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

-- Note: All business functions, triggers, and RLS policies originally drafted in
-- 20261023000001 are modularized, hardened, and authoritatively defined in the
-- dedicated Stage B, Stage C, and Stage D sections below.

-- ==========================================================================
-- SECTION: AUTHENTICATION, ROLES, RLS & FUNCTION PERMISSIONS (MIGRATION 20261023000002)
-- ==========================================================================

-- QuickCut Platform - Stage B: Authentication, Roles, RLS & Function Permissions
-- Migration: 20261023000002_security_auth_roles_rls.sql

-- 1. Ensure timezone column exists on shops
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 2. Hardened Helper Security Functions (PL/pgSQL to prevent RLS inlining recursion, safe search_path)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
DECLARE
    v_role user_role := 'customer';
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN COALESCE(v_role, 'customer'::user_role);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_is_admin BOOLEAN := false;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;
    RETURN v_is_admin;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_shop_owner(target_shop_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_owner BOOLEAN := false;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = target_shop_id AND owner_id = auth.uid()
    ) INTO v_is_owner;
    RETURN v_is_owner;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_shop_staff(target_shop_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_staff BOOLEAN := false;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.shop_staff
        WHERE shop_id = target_shop_id AND user_id = auth.uid()
    ) INTO v_is_staff;
    RETURN v_is_staff;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

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

-- 4. Column-Level Permission Hardening on Profiles
-- Explicitly revoke table-level UPDATE from public, anon, and authenticated so column-level restrictions cannot be bypassed
REVOKE UPDATE ON public.profiles FROM authenticated, anon, PUBLIC;
REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon, PUBLIC;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, updated_at) ON public.profiles TO authenticated;

-- 5. Trigger to Prevent Unauthorized Direct Role Changes on Profiles Table (Defense-in-depth)
CREATE OR REPLACE FUNCTION public.fn_prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Non-admins cannot insert any role other than customer
        IF NEW.role != 'customer' AND NOT (auth.uid() IS NULL OR public.is_admin()) THEN
            NEW.role := 'customer'::user_role;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If role is changing, only a verified platform administrator or superuser can authorize it
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF NOT (auth.uid() IS NULL OR public.is_admin()) THEN
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

-- 6. Shop Approval and Critical Field Protection Triggers
CREATE OR REPLACE FUNCTION public.fn_protect_shop_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent non-admins from changing shop status (approval/suspension) or owner_id
    IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can change shop approval status or ownership.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_shop_critical_fields ON public.shops;
CREATE TRIGGER trg_protect_shop_critical_fields
BEFORE UPDATE ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_shop_updates();

CREATE OR REPLACE FUNCTION public.fn_handle_shop_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When admin approves a shop, elevate owner profile to 'owner' role
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        IF auth.uid() IS NULL OR public.is_admin() THEN
            UPDATE public.profiles
            SET role = 'owner'::user_role, updated_at = timezone('utc'::text, now())
            WHERE id = NEW.owner_id AND role = 'customer';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_handle_shop_status_change ON public.shops;
CREATE TRIGGER trg_handle_shop_status_change
AFTER UPDATE OF status ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.fn_handle_shop_status_change();

-- 7. Drop Deprecated Staff Global Role Mutation Trigger
-- Staff access is shop-scoped via public.shop_staff rows and public.is_shop_staff(shop_id).
-- Decouple staff membership from mutating global profile roles to eliminate cross-shop pollution.
DROP TRIGGER IF EXISTS trg_handle_staff_assignment ON public.shop_staff;
DROP FUNCTION IF EXISTS public.fn_handle_staff_assignment();

-- 8. Super Admin RPC for Privileged User Role Updates
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
    p_user_id UUID,
    p_new_role user_role
)
RETURNS JSONB AS $$
DECLARE
    v_old_role user_role;
BEGIN
    IF NOT (auth.uid() IS NULL OR public.is_admin()) THEN
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
    OR EXISTS (
        SELECT 1 FROM public.shop_staff ss
        WHERE ss.user_id = profiles.id
        AND (public.is_shop_owner(ss.shop_id) OR public.is_shop_staff(ss.shop_id))
    )
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
    id = auth.uid() OR public.is_admin()
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

-- Owners and staff can update operational details (status & owner_id changes strictly guarded by trg_protect_shop_critical_fields)
DROP POLICY IF EXISTS "shops_update_policy" ON public.shops;
CREATE POLICY "shops_update_policy" ON public.shops
FOR UPDATE USING (
    public.is_admin() OR owner_id = auth.uid() OR public.is_shop_staff(id)
) WITH CHECK (
    public.is_admin() OR owner_id = auth.uid() OR public.is_shop_staff(id)
);

-- 7c. Shop Staff Policies (Strict Shop-Scoped Membership)
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
    -- Only an admin or the verified owner of an approved shop can assign staff
    public.is_admin()
    OR (
        public.is_shop_owner(shop_id)
        AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_staff.shop_id AND s.status = 'approved')
    )
);

DROP POLICY IF EXISTS "shop_staff_update_policy" ON public.shop_staff;
CREATE POLICY "shop_staff_update_policy" ON public.shop_staff
FOR UPDATE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
) WITH CHECK (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "shop_staff_delete_policy" ON public.shop_staff;
CREATE POLICY "shop_staff_delete_policy" ON public.shop_staff
FOR DELETE USING (
    public.is_admin() OR public.is_shop_owner(shop_id)
);

-- 7d. Queue Entries Policies
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

-- 8. Restrict Privileged Function Permissions (Least Privilege)
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

-- Revoke direct execution of internal trigger functions from PUBLIC and anon
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_prevent_profile_role_escalation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_handle_shop_status_change() FROM PUBLIC, anon;

-- ==========================================================================
-- SECTION: ATOMIC QUEUE NUMBERING, QR CHECK-IN & TRANSITIONS (MIGRATION 20261023000003)
-- ==========================================================================

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

    -- 4e. Core Platform Zero-Fee Invariant:
    -- QuickCut operates at ₹0 platform fee. No queue entry is billable.
    NEW.is_billable := false;

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
            'is_billable', false,
            'platform_fee_inr', 0.00,
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
        'is_billable', false,
        'platform_fee_inr', 0.00,
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

-- ==========================================================================
-- SECTION 6.5: COMPLETE REMOVAL OF PLATFORM FEE (Migration 20261024000001)
-- QuickCut operates with ZERO platform fees (₹0 per service, ₹0 monthly subscription, ₹0 commission).
-- Barber shop owners and customers are never charged any platform fee.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_compute_queue_entry_billable ON public.queue_entries;
DROP TRIGGER IF EXISTS trg_protect_fee_record_updates ON public.fee_records;

CREATE OR REPLACE FUNCTION public.fn_compute_queue_entry_billable()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_billable := false;
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.complete_service_atomic(
    p_entry_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_shop_id UUID;
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
            'is_billable', false,
            'platform_fee_inr', 0.00,
            'already_completed', true
        );
    END IF;

    IF v_entry.status NOT IN ('in_service', 'waiting') THEN
        RAISE EXCEPTION 'Cannot complete ticket #% with status "%".', v_entry.queue_number, v_entry.status;
    END IF;

    UPDATE public.queue_entries
    SET status = 'completed',
        completed_at = timezone('utc'::text, now()),
        is_billable = false,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', p_entry_id,
        'queue_number', v_entry.queue_number,
        'status', 'completed',
        'is_billable', false,
        'platform_fee_inr', 0.00,
        'already_completed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.generate_monthly_fee_record(
    p_shop_id UUID, 
    p_month TEXT
)
RETURNS UUID AS $$
BEGIN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.process_fee_payment(
    p_fee_record_id UUID,
    p_payment_method TEXT DEFAULT 'UPI',
    p_transaction_ref TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Platform fee is ₹0. No fee payment is required.',
        'status', 'zero_fee'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.dispute_fee_record(
    p_fee_record_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Platform fee system is deactivated. No fees to dispute.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.admin_adjust_fee_record(
    p_fee_record_id UUID,
    p_new_status fee_status,
    p_adjusted_amount NUMERIC(10, 2),
    p_admin_note TEXT
)
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Platform fee system is deactivated.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER TABLE public.fee_records ALTER COLUMN rate_per_service SET DEFAULT 0.00;

UPDATE public.fee_records
SET amount = 0.00,
    rate_per_service = 0.00,
    status = 'waived',
    updated_at = timezone('utc'::text, now())
WHERE status IN ('pending', 'disputed');

UPDATE public.queue_entries
SET is_billable = false
WHERE is_billable = true;

DELETE FROM public.notifications
WHERE type = 'billing' OR title ILIKE '%fee%' OR message ILIKE '%billable%' OR message ILIKE '%platform fee%';

-- ============================================================================
-- SECTION 6.6: QUEUE AGGREGATES, MULTI-BARBER WAIT TIME & SECURITY HARDENING (Migration 20261024000002)
-- ============================================================================

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
        (CEIL(COALESCE(qc.total_duration, 0)::NUMERIC / GREATEST(COALESCE(ab.barber_count, 1), 1)))::BIGINT AS estimated_wait_minutes
    FROM public.shops sh
    LEFT JOIN queue_counts qc ON sh.id = qc.q_shop_id
    LEFT JOIN active_barbers_per_shop ab ON sh.id = ab.b_shop_id
    WHERE sh.status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_shops_queue_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shops_queue_summary() TO anon, authenticated, service_role;

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

    SELECT GREATEST(COUNT(*), 1)
    INTO v_active_barbers
    FROM public.barbers
    WHERE shop_id = v_shop_id AND is_active = true;

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

    IF NOT (v_is_admin OR v_is_staff OR v_is_owner OR v_is_customer) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot check in this queue entry.';
    END IF;

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

    IF NOT v_token_matched THEN
        IF v_entry.qr_code_token::text = v_token_clean THEN
            v_token_matched := true;
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

    IF p_barber_id IS NOT NULL THEN
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

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
FOR INSERT WITH CHECK (
    public.is_admin()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_shop_status ON public.support_tickets(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_entries_wait_calc ON public.queue_entries(shop_id, status, created_at);

-- ============================================================================
-- SECTION 6.7: QR HARDENING, QUEUE JOIN DEFENSE-IN-DEPTH & PRIVACY ISOLATION
-- (Migration 20261024000003)
-- ============================================================================

-- 1. SEC-09: Defense-in-Depth Validation in join_queue() RPC
CREATE OR REPLACE FUNCTION public.join_queue(
    p_shop_id UUID,
    p_service_id UUID,
    p_barber_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_new_id UUID;
    v_queue_number INTEGER;
    v_qr_token UUID;
    v_shop_status shop_status;
    v_is_paused BOOLEAN;
    v_shop_tz TEXT;
BEGIN
    -- 1a. Authentication validation
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join queue.';
    END IF;

    -- 1b. Customer profile existence check
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Customer profile does not exist. Please complete profile setup.';
    END IF;

    -- 1c. Shop existence, approval status & queue paused state
    SELECT status, is_queue_paused, COALESCE(timezone, 'Asia/Kolkata')
    INTO v_shop_status, v_is_paused, v_shop_tz
    FROM public.shops
    WHERE id = p_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target barber shop does not exist.';
    END IF;

    IF v_shop_status != 'approved' THEN
        RAISE EXCEPTION 'Cannot join queue: Barber shop is not active or approved.';
    END IF;

    IF v_is_paused THEN
        RAISE EXCEPTION 'This barber shop has temporarily paused incoming queue entries.';
    END IF;

    -- 1d. Service belongs to selected shop and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.services 
        WHERE id = p_service_id AND shop_id = p_shop_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Selected service does not belong to this shop or is inactive.';
    END IF;

    -- 1e. Barber belongs to selected shop and is active (if specified)
    IF p_barber_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.barbers 
        WHERE id = p_barber_id AND shop_id = p_shop_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Selected barber does not belong to this shop or is inactive.';
    END IF;

    -- 1f. Invariant: Only ONE active ticket per customer globally
    IF EXISTS (
        SELECT 1 FROM public.queue_entries
        WHERE customer_id = auth.uid()
          AND status IN ('waiting', 'in_service')
    ) THEN
        RAISE EXCEPTION 'Customer already holds an active queue ticket across the platform.';
    END IF;

    -- 1g. Atomic insert (queue number and QR token generated by server)
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
    RETURNING id, queue_number, qr_code_token INTO v_new_id, v_queue_number, v_qr_token;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_new_id,
        'queue_number', v_queue_number,
        'qr_token', v_qr_token
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.join_queue(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_queue(UUID, UUID, UUID) TO authenticated, service_role;

-- 2. SEC-08: Cryptographic QR Check-in Hardening (verify_qr_checkin)
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

    -- Fetch shop timezone and local calendar date
    SELECT COALESCE(timezone, 'Asia/Kolkata') INTO v_shop_tz
    FROM public.shops WHERE id = v_entry.shop_id;
    v_current_local_date := (timezone(v_shop_tz, now()))::DATE;

    -- Caller authorization check
    v_is_admin := public.is_admin();
    v_is_staff := public.is_shop_staff(v_entry.shop_id);
    v_is_owner := public.is_shop_owner(v_entry.shop_id);
    v_is_customer := (auth.uid() = v_entry.customer_id);

    IF NOT (v_is_admin OR v_is_staff OR v_is_owner OR v_is_customer) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot check in this queue entry.';
    END IF;

    -- Expiration check: Ticket must be for current local date and within 24 hours
    IF v_entry.queue_date < v_current_local_date OR v_entry.created_at < (now() - INTERVAL '24 hours') THEN
        RAISE EXCEPTION 'Ticket #% has expired and cannot be checked in.', v_entry.queue_number;
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
        RAISE EXCEPTION 'Ticket #% cannot be checked in because its status is "%".', v_entry.queue_number, v_entry.status;
    END IF;

    v_token_clean := TRIM(p_qr_token);
    IF v_token_clean = '' THEN
        RAISE EXCEPTION 'Check-in token cannot be empty.';
    END IF;

    -- Cryptographic QR verification:
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

    -- Check direct cryptographic random token match (UUID)
    IF NOT v_token_matched THEN
        IF v_entry.qr_code_token::text = v_token_clean THEN
            v_token_matched := true;
        END IF;
    END IF;

    -- Strictly reject queue number, partial match, or shop ID as proof of authenticity
    IF NOT v_token_matched THEN
        RAISE EXCEPTION 'Invalid check-in QR code or token for Ticket #%. Cryptographic QR proof of arrival required.', v_entry.queue_number;
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

-- 3. SEC-10: Complete Customer Data Isolation (queue_entries_select_policy)
DROP POLICY IF EXISTS "queue_entries_select_policy" ON public.queue_entries;
CREATE POLICY "queue_entries_select_policy" ON public.queue_entries
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR public.is_shop_staff(shop_id)
    OR customer_id = auth.uid()
);

-- 4. SEC-11: Multi-Barber Waiting Time Calculation Enhancement
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

-- ============================================================================
-- SECTION 6.8: CUSTOMER PAYMENTS SUPPORT & STAFF AUDIT HARDENING
-- (Migration 20261024000004)
-- ============================================================================

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS queue_entry_id UUID REFERENCES public.queue_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_queue_entry ON public.payments(queue_entry_id);

DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
CREATE POLICY "payments_select_policy" ON public.payments
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR customer_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.log_staff_audit_event(
    p_action TEXT,
    p_entity_id TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_is_staff BOOLEAN := false;
    v_is_owner BOOLEAN := false;
    v_is_admin BOOLEAN := false;
    v_shop_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required for audit logging.';
    END IF;

    v_is_admin := public.is_admin();

    -- Verify caller is authorized staff or owner for the target queue entry or shop
    IF NOT v_is_admin THEN
        BEGIN
            SELECT shop_id INTO v_shop_id
            FROM public.queue_entries
            WHERE id = p_entity_id::uuid;

            IF FOUND THEN
                v_is_staff := public.is_shop_staff(v_shop_id);
                v_is_owner := public.is_shop_owner(v_shop_id);
            ELSE
                -- Check if entity_id is directly a shop_id
                v_is_staff := public.is_shop_staff(p_entity_id::uuid);
                v_is_owner := public.is_shop_owner(p_entity_id::uuid);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_is_staff := false;
            v_is_owner := false;
        END;

        IF NOT (v_is_staff OR v_is_owner) THEN
            RAISE EXCEPTION 'Unauthorized: Caller is not staff or owner for this entity.';
        END IF;
    END IF;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        payload,
        created_at
    )
    VALUES (
        v_user_id,
        p_action,
        'queue_entries',
        p_entity_id,
        p_payload,
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.log_staff_audit_event(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_staff_audit_event(TEXT, TEXT, JSONB) TO authenticated, service_role;

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.queue_entries qe
            WHERE qe.id::text = audit_logs.entity_id
              AND (public.is_shop_staff(qe.shop_id) OR public.is_shop_owner(qe.shop_id))
        )
    )
);

-- ============================================================================
-- SECTION 6.9: QR ERROR SANITIZATION & STORAGE BUCKET SECURITY
-- (Migration 20261024000005)
-- ============================================================================

-- 1. SEC-15: Sanitized verify_qr_checkin() RPC (No internal ticket # disclosure)
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

    -- Fetch shop timezone and local calendar date
    SELECT COALESCE(timezone, 'Asia/Kolkata') INTO v_shop_tz
    FROM public.shops WHERE id = v_entry.shop_id;
    v_current_local_date := (timezone(v_shop_tz, now()))::DATE;

    -- Caller authorization check
    v_is_admin := public.is_admin();
    v_is_staff := public.is_shop_staff(v_entry.shop_id);
    v_is_owner := public.is_shop_owner(v_entry.shop_id);
    v_is_customer := (auth.uid() = v_entry.customer_id);

    IF NOT (v_is_admin OR v_is_staff OR v_is_owner OR v_is_customer) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot check in this queue entry.';
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

    -- Check direct cryptographic random token match (UUID)
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

-- 2. SEC-16: Storage Bucket Security & RLS Policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN

        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'avatars',
            'avatars',
            true,
            5242880,
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = true,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'shop-assets',
            'shop-assets',
            true,
            5242880,
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = true,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        DROP POLICY IF EXISTS "avatars_public_select_policy" ON storage.objects;
        CREATE POLICY "avatars_public_select_policy" ON storage.objects
        FOR SELECT USING (bucket_id = 'avatars');

        DROP POLICY IF EXISTS "avatars_user_insert_policy" ON storage.objects;
        CREATE POLICY "avatars_user_insert_policy" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'avatars'
            AND (
                public.is_admin()
                OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
            )
        );

        DROP POLICY IF EXISTS "avatars_user_update_policy" ON storage.objects;
        CREATE POLICY "avatars_user_update_policy" ON storage.objects
        FOR UPDATE USING (
            bucket_id = 'avatars'
            AND (
                public.is_admin()
                OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
            )
        );

        DROP POLICY IF EXISTS "avatars_user_delete_policy" ON storage.objects;
        CREATE POLICY "avatars_user_delete_policy" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'avatars'
            AND (
                public.is_admin()
                OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
            )
        );

        DROP POLICY IF EXISTS "shop_assets_public_select_policy" ON storage.objects;
        CREATE POLICY "shop_assets_public_select_policy" ON storage.objects
        FOR SELECT USING (bucket_id = 'shop-assets');

        DROP POLICY IF EXISTS "shop_assets_owner_insert_policy" ON storage.objects;
        CREATE POLICY "shop_assets_owner_insert_policy" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'shop-assets'
            AND (
                public.is_admin()
                OR (
                    auth.uid() IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.shops
                        WHERE id::text = (storage.foldername(name))[1]
                          AND owner_id = auth.uid()
                    )
                )
            )
        );

        DROP POLICY IF EXISTS "shop_assets_owner_update_policy" ON storage.objects;
        CREATE POLICY "shop_assets_owner_update_policy" ON storage.objects
        FOR UPDATE USING (
            bucket_id = 'shop-assets'
            AND (
                public.is_admin()
                OR (
                    auth.uid() IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.shops
                        WHERE id::text = (storage.foldername(name))[1]
                          AND owner_id = auth.uid()
                    )
                )
            )
        );

        DROP POLICY IF EXISTS "shop_assets_owner_delete_policy" ON storage.objects;
        CREATE POLICY "shop_assets_owner_delete_policy" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'shop-assets'
            AND (
                public.is_admin()
                OR (
                    auth.uid() IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.shops
                        WHERE id::text = (storage.foldername(name))[1]
                          AND owner_id = auth.uid()
                    )
                )
            )
        );

    END IF;
END $$;

-- 7. Ensure schema permissions, re-enforce Stage B column privileges, and reload PostgREST
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Enforce Stage B least-privilege column restrictions on profiles
REVOKE UPDATE ON public.profiles FROM authenticated, anon, PUBLIC;
REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon, PUBLIC;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, updated_at) ON public.profiles TO authenticated;

-- Notify PostgREST to reload the schema cache immediately
NOTIFY pgrst, 'reload schema';

SELECT 'SUCCESS: QuickCut database setup completed successfully! PostgREST schema cache reloaded.' AS result;
