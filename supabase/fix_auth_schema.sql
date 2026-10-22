-- ==============================================================================
-- QuickCut Platform - Fix "Database error querying schema" (500)
-- File: supabase/fix_auth_schema.sql
-- ==============================================================================
-- Root Cause:
-- Supabase Auth (GoTrue) scans auth.users columns into Go string variables.
-- When token columns (confirmation_token, recovery_token, etc.) contain SQL NULL,
-- Go's sql driver crashes with:
--   "sql: Scan error on column confirmation_token: converting NULL to string is unsupported"
-- and returns "500: Database error querying schema".
--
-- This script fixes all existing auth.users, registers identities, and reloads PostgREST.
-- ==============================================================================

-- 1. Fix NULL token columns in auth.users by converting NULLs to empty strings ('')
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

-- 2. Ensure auth.identities exists for all auth.users so Supabase Auth can find them
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT 
    id,
    id as user_id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email' as provider,
    id::text as provider_id,
    now(),
    now(),
    now()
FROM auth.users
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 3. Ensure permissions on public schema and all tables are granted
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- 4. Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'SUCCESS: auth.users tokens patched, identities linked, and schema reloaded!' AS result;
