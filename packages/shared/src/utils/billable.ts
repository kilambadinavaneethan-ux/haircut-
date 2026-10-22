import { PLATFORM_CONFIG } from '../constants/config';
import { QueueEntry, FeeRecord } from '../types/models';

/**
 * Validates whether a given queue entry qualifies as billable.
 *
 * Invariants:
 * 1. Customer QR check-in exists (checked_in_at is not null)
 * 2. Staff completion exists (completed_at is not null and status is 'completed')
 * 3. Not a walk-in (is_walkin is false)
 * 4. Not cancelled or no-show (status must be 'completed')
 */
export function isEntryBillable(entry: Partial<QueueEntry>): boolean {
  if (!entry) return false;

  const hasCheckIn = !!entry.checked_in_at;
  const isCompleted = entry.status === 'completed' && !!entry.completed_at;
  const isOnlineCustomer = entry.is_walkin === false;

  return hasCheckIn && isCompleted && isOnlineCustomer;
}

/**
 * Calculates platform fee based on billable completions.
 * Fixed rule: Rs 5 per billable service.
 */
export function calculatePlatformFee(
  billableCount: number,
  rate = PLATFORM_CONFIG.BILLABLE_FEE_PER_SERVICE
): { count: number; rate: number; totalAmount: number; currency: string } {
  const count = Math.max(0, Math.floor(billableCount));
  const totalAmount = Number((count * rate).toFixed(2));

  return {
    count,
    rate,
    totalAmount,
    currency: PLATFORM_CONFIG.CURRENCY.CODE
  };
}

/**
 * Checks if a fee invoice is currently within the active dispute window.
 */
export function isFeeDisputable(feeRecord: Pick<FeeRecord, 'status' | 'disputed_until'>): boolean {
  if (feeRecord.status !== 'pending') {
    return false;
  }
  const deadline = new Date(feeRecord.disputed_until).getTime();
  const now = Date.now();
  return now <= deadline;
}

/**
 * Returns formatted currency string (e.g., "Rs 5.00" or "₹5")
 */
export function formatFeeAmount(amount: number): string {
  return `${PLATFORM_CONFIG.CURRENCY.LABEL} ${amount.toFixed(2)}`;
}
