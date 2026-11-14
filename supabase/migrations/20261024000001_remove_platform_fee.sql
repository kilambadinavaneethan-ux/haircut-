-- QuickCut Platform - Complete Removal of ₹5 Platform Fee
-- Migration: 20261024000001_remove_platform_fee.sql
-- Invariant: QuickCut operates with ZERO platform fees (₹0 per service, ₹0 monthly subscription, ₹0 commission).
-- Barber shop owners and customers are never charged any platform fee.

-- ============================================================================
-- 1. Deactivate Billable Computation Triggers on queue_entries
-- ============================================================================

-- Drop the old billable computation trigger if it exists
DROP TRIGGER IF EXISTS trg_compute_queue_entry_billable ON public.queue_entries;

-- Update fn_compute_queue_entry_billable to ensure is_billable is always false
CREATE OR REPLACE FUNCTION public.fn_compute_queue_entry_billable()
RETURNS TRIGGER AS $$
BEGIN
    -- QuickCut operates at ₹0 platform fee. No queue entry is billable.
    NEW.is_billable := false;
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Update Queue Entry Protection Trigger (fn_protect_queue_entry_updates)
-- ============================================================================
-- Keeps all lifecycle invariants, terminal state protection, customer restrictions,
-- and automated timestamps, while setting is_billable to false permanently.

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

    -- 2a. Terminal State Protection: Once completed, cancelled, or no_show, status is immutable
    IF OLD.status IN ('completed', 'cancelled', 'no_show') AND NEW.status != OLD.status THEN
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'Ticket #% is in terminal state "%" and cannot be modified.', OLD.queue_number, OLD.status;
        END IF;
    END IF;

    -- 2b. Customer Update Restrictions: Customers can ONLY cancel their waiting ticket
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
        NEW.is_billable := false;
        NEW.completed_at := OLD.completed_at;
        NEW.called_at := OLD.called_at;
        NEW.checked_in_at := OLD.checked_in_at;
        NEW.qr_code_token := OLD.qr_code_token;
    END IF;

    -- 2c. Valid Lifecycle Transitions Enforcement:
    -- waiting -> in_service, cancelled, no_show (or completed if walk-in)
    -- in_service -> completed, cancelled, no_show
    IF NEW.status != OLD.status AND NOT v_is_admin THEN
        IF OLD.status = 'waiting' AND NEW.status = 'completed' AND OLD.is_walkin = false THEN
            RAISE EXCEPTION 'Online ticket #% must be called in_service before completion.', OLD.queue_number;
        END IF;
    END IF;

    -- 2d. Automated Trusted Timestamps
    IF NEW.status = 'in_service' AND OLD.status != 'in_service' AND NEW.called_at IS NULL THEN
        NEW.called_at := timezone('utc'::text, now());
    END IF;

    IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := timezone('utc'::text, now());
    END IF;

    -- 2e. Core Platform Zero-Fee Rule:
    -- QuickCut operates without platform fees. No service is billable.
    NEW.is_billable := false;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 3. Update Service Completion RPC (complete_service_atomic)
-- ============================================================================
-- Service completion only updates queue and service status.
-- Generates ₹0 platform fee and zero payment obligations.

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

-- ============================================================================
-- 4. Safely Deactivate Fee Generation & Billing Functions
-- ============================================================================

-- Deactivate monthly fee invoice generation: Retained as safe no-op to prevent RPC caller errors
CREATE OR REPLACE FUNCTION public.generate_monthly_fee_record(
    p_shop_id UUID, 
    p_month TEXT
)
RETURNS UUID AS $$
BEGIN
    -- Platform fee system is completely deactivated (QuickCut operates at ₹0 fee)
    -- No fee records or invoices are generated.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Drop protection trigger on fee_records to allow zero-balance adjustments
DROP TRIGGER IF EXISTS trg_protect_fee_record_updates ON public.fee_records;

-- Deactivate fee payment processing: Retained as safe no-op
CREATE OR REPLACE FUNCTION public.process_fee_payment(
    p_fee_record_id UUID,
    p_payment_method TEXT DEFAULT 'UPI',
    p_transaction_ref TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    -- QuickCut operates at ₹0 platform fee. No payment processing is required.
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Platform fee is ₹0. No fee payment is required.',
        'status', 'zero_fee'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Deactivate fee dispute RPC: Retained as safe no-op
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

-- Deactivate admin fee adjustment RPC: Retained as safe no-op
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

-- ============================================================================
-- 5. Safe Data Migration & Balance Clearance
-- ============================================================================
-- Update default rate_per_service to 0.00
ALTER TABLE public.fee_records ALTER COLUMN rate_per_service SET DEFAULT 0.00;

-- Zero out any pending or disputed platform fee obligations.
-- Ensure barber shop owners have ₹0 pending fee balance.

UPDATE public.fee_records
SET amount = 0.00,
    rate_per_service = 0.00,
    status = 'waived',
    updated_at = timezone('utc'::text, now())
WHERE status IN ('pending', 'disputed');

-- Reset any historical queue entries marked billable to false
UPDATE public.queue_entries
SET is_billable = false
WHERE is_billable = true;

-- Remove fee-related notification records so users receive no fee alerts
DELETE FROM public.notifications
WHERE type = 'billing' OR title ILIKE '%fee%' OR message ILIKE '%billable%' OR message ILIKE '%platform fee%';

-- ============================================================================
-- 6. Permissions Hardening
-- ============================================================================
REVOKE ALL ON FUNCTION public.generate_monthly_fee_record(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_fee_record(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_fee_payment(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_fee_payment(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_service_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_service_atomic(UUID) TO authenticated, service_role;
