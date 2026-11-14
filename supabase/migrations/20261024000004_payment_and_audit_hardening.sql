-- QuickCut Platform - Stage G: Customer Payments Support & Staff Audit Hardening
-- Migration: 20261024000004_payment_and_audit_hardening.sql
-- Fixes:
-- 1. AUD-01 / AUD-02: Secure Staff Audit Logging RPC and hardened RLS insert policy
-- 2. AUD-06: Customer-to-Shop Payments Support (customer_id, queue_entry_id) while preserving historical records

-- ============================================================================
-- 1. AUD-06: Customer-to-Shop Payments Columns & RLS Policy
-- ============================================================================

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS queue_entry_id UUID REFERENCES public.queue_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_queue_entry ON public.payments(queue_entry_id);

-- Update Payments Select RLS Policy to allow customers to view their own payment transactions
DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
CREATE POLICY "payments_select_policy" ON public.payments
FOR SELECT USING (
    public.is_admin()
    OR public.is_shop_owner(shop_id)
    OR customer_id = auth.uid()
);

-- ============================================================================
-- 2. AUD-02: Authoritative Staff Audit Event Logging RPC
-- ============================================================================

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

-- Allow verified staff & owners to insert into audit_logs directly for their shop's entries
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
