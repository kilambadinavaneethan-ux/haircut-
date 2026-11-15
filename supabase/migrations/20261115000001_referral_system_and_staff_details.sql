-- QuickCut Platform - Referral System and Staff Details
-- Migration: 20261115000001_referral_system_and_staff_details.sql

-- 1. Add referral columns to profiles, barbers, shops
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- 2. Create referrals tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code TEXT NOT NULL,
    referrer_type TEXT NOT NULL, -- 'staff' | 'barber' | 'owner' | 'shop'
    referrer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    barber_id UUID REFERENCES public.barbers(id) ON DELETE SET NULL,
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    customer_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_customer ON public.referrals(customer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_barber ON public.referrals(barber_id);
CREATE INDEX IF NOT EXISTS idx_barbers_code ON public.barbers(referral_code);
CREATE INDEX IF NOT EXISTS idx_shops_code ON public.shops(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_code ON public.profiles(referral_code);

-- 4. Clean default codes
UPDATE public.shops
SET referral_code = UPPER(SPLIT_PART(REGEXP_REPLACE(name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) || '2026'
WHERE referral_code IS NULL;

UPDATE public.barbers
SET referral_code = 'STF-' || UPPER(SPLIT_PART(REGEXP_REPLACE(name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1))
WHERE referral_code IS NULL;

UPDATE public.profiles
SET referral_code = CASE
  WHEN role = 'owner' THEN 'OWNER-' || UPPER(SPLIT_PART(REGEXP_REPLACE(full_name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1))
  WHEN role = 'staff' THEN 'STF-' || UPPER(SPLIT_PART(REGEXP_REPLACE(full_name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1))
  ELSE 'CUST-' || UPPER(SUBSTRING(id::text, 1, 6))
END
WHERE referral_code IS NULL;

-- 5. Referral validation function
CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_clean_code TEXT;
    v_barber RECORD;
    v_shop RECORD;
    v_profile RECORD;
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Empty referral code.');
    END IF;

    v_clean_code := UPPER(TRIM(p_code));

    -- 1. Check Barbers / Staff
    SELECT b.id as barber_id, b.name as barber_name, b.user_id, s.id as shop_id, s.name as shop_name, b.referral_code
    INTO v_barber
    FROM public.barbers b
    JOIN public.shops s ON s.id = b.shop_id
    WHERE UPPER(COALESCE(b.referral_code, '')) = v_clean_code
       OR UPPER('STF-' || SPLIT_PART(REGEXP_REPLACE(b.name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) = v_clean_code
       OR UPPER(SPLIT_PART(REGEXP_REPLACE(b.name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) = v_clean_code
       OR UPPER(SPLIT_PART(REGEXP_REPLACE(b.name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) || '2026' = v_clean_code
       OR UPPER('BARBER-' || SPLIT_PART(REGEXP_REPLACE(b.name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) = v_clean_code
    LIMIT 1;

    IF v_barber.barber_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'valid', true,
            'referrer_type', 'staff',
            'referrer_name', v_barber.barber_name,
            'shop_name', v_barber.shop_name,
            'shop_id', v_barber.shop_id,
            'barber_id', v_barber.barber_id,
            'referrer_user_id', v_barber.user_id,
            'referral_code', COALESCE(v_barber.referral_code, v_clean_code)
        );
    END IF;

    -- 2. Check Shops (Owner Referral Code)
    SELECT s.id as shop_id, s.name as shop_name, s.owner_id, p.full_name as owner_name, s.referral_code
    INTO v_shop
    FROM public.shops s
    LEFT JOIN public.profiles p ON p.id = s.owner_id
    WHERE UPPER(COALESCE(s.referral_code, '')) = v_clean_code
       OR UPPER(SPLIT_PART(REGEXP_REPLACE(s.name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) || '2026' = v_clean_code
       OR UPPER(SPLIT_PART(REGEXP_REPLACE(s.name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) = v_clean_code
       OR UPPER(REGEXP_REPLACE(s.name, '[^a-zA-Z0-9]', '', 'g')) = v_clean_code
       OR UPPER(REGEXP_REPLACE(s.name, '[^a-zA-Z0-9]', '', 'g')) || '2026' = v_clean_code
       OR (p.full_name IS NOT NULL AND UPPER('OWNER-' || SPLIT_PART(REGEXP_REPLACE(p.full_name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) = v_clean_code)
       OR (p.full_name IS NOT NULL AND UPPER(SPLIT_PART(REGEXP_REPLACE(p.full_name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) || '2026' = v_clean_code)
       OR (p.full_name IS NOT NULL AND UPPER(SPLIT_PART(REGEXP_REPLACE(p.full_name, '[^a-zA-Z0-9 ]', '', 'g'), ' ', 1)) = v_clean_code)
    LIMIT 1;

    IF v_shop.shop_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'valid', true,
            'referrer_type', 'owner',
            'referrer_name', COALESCE(v_shop.owner_name, v_shop.shop_name),
            'shop_name', v_shop.shop_name,
            'shop_id', v_shop.shop_id,
            'barber_id', null,
            'referrer_user_id', v_shop.owner_id,
            'referral_code', COALESCE(v_shop.referral_code, v_clean_code)
        );
    END IF;

    -- 3. Check Profiles
    SELECT p.id, p.full_name, p.role, p.referral_code
    INTO v_profile
    FROM public.profiles p
    WHERE UPPER(COALESCE(p.referral_code, '')) = v_clean_code
    LIMIT 1;

    IF v_profile.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'valid', true,
            'referrer_type', v_profile.role,
            'referrer_name', v_profile.full_name,
            'shop_name', null,
            'shop_id', null,
            'barber_id', null,
            'referrer_user_id', v_profile.id,
            'referral_code', v_profile.referral_code
        );
    END IF;

    RETURN jsonb_build_object('valid', false, 'message', 'Referral code not found. Please verify with your barber or shop owner.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Apply referral function
CREATE OR REPLACE FUNCTION public.apply_customer_referral(
    p_customer_id UUID,
    p_code TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_val JSONB;
BEGIN
    v_val := public.validate_referral_code(p_code);
    IF NOT (v_val->>'valid')::boolean THEN
        RETURN v_val;
    END IF;

    -- Update customer profile
    UPDATE public.profiles
    SET referred_by_code = v_val->>'referral_code',
        referred_by_id = (v_val->>'referrer_user_id')::uuid
    WHERE id = p_customer_id;

    -- Record in referrals table
    INSERT INTO public.referrals (
        referral_code,
        referrer_type,
        referrer_user_id,
        barber_id,
        shop_id,
        customer_id,
        customer_name
    )
    SELECT
        v_val->>'referral_code',
        v_val->>'referrer_type',
        (v_val->>'referrer_user_id')::uuid,
        (v_val->>'barber_id')::uuid,
        (v_val->>'shop_id')::uuid,
        p_customer_id,
        (SELECT full_name FROM public.profiles WHERE id = p_customer_id);

    RETURN jsonb_build_object('success', true, 'info', v_val);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. RLS policies on referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'referrals' AND policyname = 'Allow read referrals'
    ) THEN
        CREATE POLICY "Allow read referrals" ON public.referrals FOR SELECT TO authenticated, anon USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'referrals' AND policyname = 'Allow insert referrals'
    ) THEN
        CREATE POLICY "Allow insert referrals" ON public.referrals FOR INSERT TO authenticated, anon WITH CHECK (true);
    END IF;
END $$;
