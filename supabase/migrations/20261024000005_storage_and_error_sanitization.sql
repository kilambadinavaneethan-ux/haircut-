-- QuickCut Platform - Stage H: QR Error Sanitization & Storage Security
-- Migration: 20261024000005_storage_and_error_sanitization.sql
-- Fixes:
-- 1. SEC-15: Error Sanitization in verify_qr_checkin() (remove internal ticket # disclosure)
-- 2. SEC-16: Storage Bucket Security & RLS Policies (avatars & shop-assets)

-- ============================================================================
-- 1. SEC-15: Sanitized verify_qr_checkin() RPC
-- ============================================================================
-- Preserves all cryptographic verification, 24h expiration, and role validation,
-- while removing internal ticket numbers and sequence IDs from client-facing exceptions.

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

    -- 1a. Expiration check: Ticket must be for current local date and within 24 hours
    -- Sanitized: Does not disclose internal queue numbers
    IF v_entry.queue_date < v_current_local_date OR v_entry.created_at < (now() - INTERVAL '24 hours') THEN
        RAISE EXCEPTION 'This check-in QR code has expired and cannot be used.';
    END IF;

    -- 1b. Idempotent check: If already checked in, return success safely
    IF v_entry.checked_in_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'entry_id', p_entry_id,
            'queue_number', v_entry.queue_number,
            'checked_in_at', v_entry.checked_in_at,
            'already_checked_in', true
        );
    END IF;

    -- 1c. Status guard: Entry must be in waiting status
    -- Sanitized: Does not disclose internal queue numbers
    IF v_entry.status != 'waiting' THEN
        RAISE EXCEPTION 'This queue ticket cannot be checked in because it is no longer in waiting status.';
    END IF;

    v_token_clean := TRIM(p_qr_token);
    IF v_token_clean = '' THEN
        RAISE EXCEPTION 'Check-in token cannot be empty.';
    END IF;

    -- 1d. Cryptographic QR verification:
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
    -- Sanitized: Uniform error message without exposing internal ticket identifiers
    IF NOT v_token_matched THEN
        RAISE EXCEPTION 'Invalid check-in QR code or token. Cryptographic QR proof of arrival required.';
    END IF;

    -- 1e. Record verified arrival check-in using trusted server database time
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
-- 2. SEC-16: Storage Bucket Security & RLS Policies
-- ============================================================================
-- Creates buckets with size & MIME type limits and enforces owner-scoped access.
-- Path structures:
--   avatars/{user_id}/{filename}
--   shop-assets/{shop_id}/{filename}
-- NOTE: Never assumes shop_id is equal to owner_id; verifies via public.shops.

DO $$
BEGIN
    -- Only proceed if the Supabase storage schema exists
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN

        -- 2a. Initialize 'avatars' Bucket (Max 5MB, Images only)
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'avatars',
            'avatars',
            true,
            5242880, -- 5 MB
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = true,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        -- 2b. Initialize 'shop-assets' Bucket (Max 5MB, Images only)
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'shop-assets',
            'shop-assets',
            true,
            5242880, -- 5 MB
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = true,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        -- 2c. Avatars RLS Policies: User can only write to avatars/{user_id}/*
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

        -- 2d. Shop Assets RLS Policies: Only verified shop owner or admin can write to shop-assets/{shop_id}/*
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
