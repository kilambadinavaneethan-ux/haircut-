/**
 * QuickCut Business Constants & Configurations
 */

export const PLATFORM_CONFIG = {
  APP_NAME: 'QuickCut',
  CURRENCY: {
    CODE: 'INR',
    SYMBOL: '₹',
    LABEL: 'Rs'
  },
  // Platform fee in INR per billable service completion
  BILLABLE_FEE_PER_SERVICE: 5.0,
  // Allowed window for shop owners to dispute monthly billing invoices
  DISPUTE_WINDOW_DAYS: 7,
  // Default interval in ms for polling queue if realtime reconnects
  QUEUE_FALLBACK_POLL_INTERVAL_MS: 15000,
  // Minimum average service minutes
  MIN_SERVICE_MINUTES: 5,
  // Maximum queue entries allowed per customer simultaneously
  MAX_ACTIVE_QUEUES_PER_CUSTOMER: 1
} as const;

export const ROLES = {
  CUSTOMER: 'customer',
  STAFF: 'staff',
  OWNER: 'owner',
  ADMIN: 'admin'
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const SHOP_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  SUSPENDED: 'suspended'
} as const;

export type ShopStatus = (typeof SHOP_STATUS)[keyof typeof SHOP_STATUS];

export const QUEUE_STATUS = {
  WAITING: 'waiting',
  IN_SERVICE: 'in_service',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
} as const;

export type QueueStatus = (typeof QUEUE_STATUS)[keyof typeof QUEUE_STATUS];

export const FEE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  DISPUTED: 'disputed',
  WAIVED: 'waived'
} as const;

export type FeeStatus = (typeof FEE_STATUS)[keyof typeof FEE_STATUS];

export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];
