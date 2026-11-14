import { PLATFORM_CONFIG } from '../constants/config';
import { QueueEntry, FeeRecord } from '../types/models';

/**
 * Validates whether a given queue entry qualifies as billable for platform fees.
 * QuickCut operates with ZERO platform fees (₹0 per service). No entries are billable.
 */
export function isEntryBillable(_entry?: Partial<QueueEntry> | null): boolean {
  return false;
}

/**
 * Calculates platform fee based on billable completions.
 * QuickCut operates with ZERO platform fees (₹0.00).
 */
export function calculatePlatformFee(
  _billableCount: number = 0,
  _rate: number = PLATFORM_CONFIG.BILLABLE_FEE_PER_SERVICE
): { count: number; rate: number; totalAmount: number; currency: string } {
  return {
    count: 0,
    rate: 0.0,
    totalAmount: 0.0,
    currency: PLATFORM_CONFIG.CURRENCY.CODE
  };
}

/**
 * Checks if a fee invoice is currently within an active dispute window.
 * Deactivated under zero platform fee policy.
 */
export function isFeeDisputable(_feeRecord?: Pick<FeeRecord, 'status' | 'disputed_until'> | null): boolean {
  return false;
}

/**
 * Returns formatted currency string (e.g., "Rs 0.00" or "₹0.00")
 */
export function formatFeeAmount(amount: number = 0): string {
  return `${PLATFORM_CONFIG.CURRENCY.LABEL} ${amount.toFixed(2)}`;
}
