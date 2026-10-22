export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: 'customer' | 'staff' | 'owner' | 'admin';
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: 'customer' | 'staff' | 'owner' | 'admin';
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: 'customer' | 'staff' | 'owner' | 'admin';
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shops: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          address: string;
          phone: string | null;
          latitude: number | null;
          longitude: number | null;
          status: 'pending' | 'approved' | 'suspended';
          opening_time: string;
          closing_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          address: string;
          phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          status?: 'pending' | 'approved' | 'suspended';
          opening_time?: string;
          closing_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          address?: string;
          phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          status?: 'pending' | 'approved' | 'suspended';
          opening_time?: string;
          closing_time?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      shop_staff: {
        Row: {
          id: string;
          shop_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
      };
      barbers: {
        Row: {
          id: string;
          shop_id: string;
          user_id: string | null;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          user_id?: string | null;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          user_id?: string | null;
          name?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      services: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          price: number;
          avg_minutes: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          name: string;
          price: number;
          avg_minutes: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          price?: number;
          avg_minutes?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      queue_entries: {
        Row: {
          id: string;
          shop_id: string;
          customer_id: string | null;
          barber_id: string | null;
          service_id: string;
          guest_name: string | null;
          guest_phone: string | null;
          queue_number: number;
          status: 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'no_show';
          qr_code_token: string;
          checked_in_at: string | null;
          called_at: string | null;
          completed_at: string | null;
          is_walkin: boolean;
          is_billable: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          customer_id?: string | null;
          barber_id?: string | null;
          service_id: string;
          guest_name?: string | null;
          guest_phone?: string | null;
          queue_number?: number;
          status?: 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'no_show';
          qr_code_token?: string;
          checked_in_at?: string | null;
          called_at?: string | null;
          completed_at?: string | null;
          is_walkin?: boolean;
          is_billable?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          customer_id?: string | null;
          barber_id?: string | null;
          service_id?: string;
          guest_name?: string | null;
          guest_phone?: string | null;
          queue_number?: number;
          status?: 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'no_show';
          qr_code_token?: string;
          checked_in_at?: string | null;
          called_at?: string | null;
          completed_at?: string | null;
          is_walkin?: boolean;
          is_billable?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      fee_records: {
        Row: {
          id: string;
          shop_id: string;
          month: string;
          billable_count: number;
          rate_per_service: number;
          amount: number;
          status: 'pending' | 'paid' | 'disputed' | 'waived';
          disputed_until: string;
          dispute_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          month: string;
          billable_count?: number;
          rate_per_service?: number;
          amount?: number;
          status?: 'pending' | 'paid' | 'disputed' | 'waived';
          disputed_until: string;
          dispute_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          month?: string;
          billable_count?: number;
          rate_per_service?: number;
          amount?: number;
          status?: 'pending' | 'paid' | 'disputed' | 'waived';
          disputed_until?: string;
          dispute_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          fee_record_id: string | null;
          shop_id: string;
          amount: number;
          currency: string;
          status: string;
          payment_method: string;
          transaction_ref: string | null;
          paid_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          fee_record_id?: string | null;
          shop_id: string;
          amount: number;
          currency?: string;
          status?: string;
          payment_method?: string;
          transaction_ref?: string | null;
          paid_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          fee_record_id?: string | null;
          shop_id?: string;
          amount?: number;
          currency?: string;
          status?: string;
          payment_method?: string;
          transaction_ref?: string | null;
          paid_at?: string;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: string;
          read: boolean;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type?: string;
          read?: boolean;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: string;
          read?: boolean;
          metadata?: Json;
          created_at?: string;
        };
      };
      support_tickets: {
        Row: {
          id: string;
          user_id: string;
          shop_id: string | null;
          subject: string;
          message: string;
          status: 'open' | 'in_progress' | 'resolved' | 'closed';
          priority: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          shop_id?: string | null;
          subject: string;
          message: string;
          status?: 'open' | 'in_progress' | 'resolved' | 'closed';
          priority?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          shop_id?: string | null;
          subject?: string;
          message?: string;
          status?: 'open' | 'in_progress' | 'resolved' | 'closed';
          priority?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          payload: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          payload?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          payload?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      get_estimated_wait_time: {
        Args: {
          target_queue_entry_id: string;
        };
        Returns: {
          estimated_minutes: number;
          people_ahead: number;
          status: string;
          is_estimate: boolean;
          disclaimer: string;
        };
      };
      get_shop_current_wait: {
        Args: {
          target_shop_id: string;
        };
        Returns: {
          estimated_minutes: number;
          waiting_count: number;
          in_service_count: number;
          is_estimate: boolean;
        };
      };
      generate_monthly_fee_record: {
        Args: {
          p_shop_id: string;
          p_month: string;
        };
        Returns: string;
      };
    };
  };
}
