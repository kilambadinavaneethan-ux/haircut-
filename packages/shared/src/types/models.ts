import { Database } from './database';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Shop = Database['public']['Tables']['shops']['Row'];
export type ShopStaff = Database['public']['Tables']['shop_staff']['Row'];
export type Barber = Database['public']['Tables']['barbers']['Row'];
export type Service = Database['public']['Tables']['services']['Row'];
export type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];
export type FeeRecord = Database['public']['Tables']['fee_records']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type SupportTicket = Database['public']['Tables']['support_tickets']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

// Extended interfaces with joins for frontend views
export interface QueueEntryWithDetails extends QueueEntry {
  service?: Service;
  barber?: Barber;
  customer?: Profile;
  shop?: Shop;
  estimated_minutes_ahead?: number;
  people_ahead?: number;
}

export interface ShopWithServices extends Shop {
  services: Service[];
  barbers: Barber[];
  active_queue_count?: number;
  estimated_wait_minutes?: number;
}

export interface EstimatedWaitCalculation {
  estimatedMinutes: number;
  peopleAhead: number;
  isEstimate: true;
  disclaimer: string;
}
