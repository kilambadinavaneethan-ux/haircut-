import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Shop,
  FeeRecord,
  SupportTicket,
  AuditLog,
  Profile,
  QueueEntry,
  Service,
  Payment,
  getSupabaseClient,
  formatFeeAmount
} from '@quickcut/shared';

import AdminAuthScreen from './screens/AdminAuthScreen';
import ShopManagement from './components/ShopManagement';
import AccountManagement from './components/AccountManagement';
import PlatformActivity from './components/PlatformActivity';
import RevenueLedgers from './components/RevenueLedgers';
import AnomalyFraudWatch from './components/AnomalyFraudWatch';
import TicketsAndDisputes from './components/TicketsAndDisputes';
import PlatformSettings from './components/PlatformSettings';
import AuditLogViewer from './components/AuditLogViewer';
import { logAdminAction } from './utils/adminAudit';

// Initial Mock Seed Data
const MOCK_SHOPS: Shop[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    owner_id: '00000000-0000-0000-0000-000000000002',
    name: 'Crown & Blade Barbershop',
    address: '42 Brigade Road, Indiranagar, Bengaluru',
    phone: '+91 80 4123 4567',
    latitude: 12.9716,
    longitude: 77.5946,
    status: 'approved',
    is_queue_paused: false,
    opening_time: '09:00:00',
    closing_time: '21:00:00',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z'
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    owner_id: '00000000-0000-0000-0000-000000000002',
    name: 'Urban Fades Lounge',
    address: '18 Koramangala 5th Block, Bengaluru',
    phone: '+91 80 4987 6543',
    latitude: 12.9352,
    longitude: 77.6245,
    status: 'pending',
    is_queue_paused: false,
    opening_time: '10:00:00',
    closing_time: '22:00:00',
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z'
  }
];

const MOCK_PROFILES: Profile[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    role: 'admin',
    full_name: 'Antigravity Super Admin',
    phone: '+91 99000 11111',
    avatar_url: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    role: 'owner',
    full_name: 'Alex Rivera (Owner)',
    phone: '+91 98888 22222',
    avatar_url: null,
    created_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    role: 'staff',
    full_name: 'Sam Wilson (Head Barber)',
    phone: '+91 97777 33333',
    avatar_url: null,
    created_at: '2026-09-15T00:00:00Z',
    updated_at: '2026-09-15T00:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    role: 'customer',
    full_name: 'Rahul Sharma',
    phone: '+91 96666 44444',
    avatar_url: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    role: 'customer',
    full_name: 'Priya Patel',
    phone: '+91 95555 55555',
    avatar_url: null,
    created_at: '2026-10-05T00:00:00Z',
    updated_at: '2026-10-05T00:00:00Z'
  }
];

const MOCK_SERVICES: Service[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    shop_id: '10000000-0000-0000-0000-000000000001',
    name: 'Classic Precision Cut',
    price: 350.0,
    avg_minutes: 25,
    is_active: true,
    created_at: '2026-10-01T00:00:00Z'
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    shop_id: '10000000-0000-0000-0000-000000000001',
    name: 'Royal Beard Sculpt & Trim',
    price: 200.0,
    avg_minutes: 20,
    is_active: true,
    created_at: '2026-10-01T00:00:00Z'
  }
];

const MOCK_QUEUE_ENTRIES: QueueEntry[] = [
  {
    id: '50000000-0000-0000-0000-000000000001',
    shop_id: '10000000-0000-0000-0000-000000000001',
    customer_id: '00000000-0000-0000-0000-000000000004',
    barber_id: null,
    service_id: '40000000-0000-0000-0000-000000000001',
    guest_name: null,
    guest_phone: null,
    queue_number: 1,
    status: 'in_service',
    qr_code_token: 'TOKEN-001',
    checked_in_at: '2026-10-22T09:15:00Z',
    called_at: '2026-10-22T09:20:00Z',
    completed_at: null,
    is_walkin: false,
    is_billable: false,
    queue_date: '2026-10-22',
    created_at: '2026-10-22T09:00:00Z',
    updated_at: '2026-10-22T09:20:00Z'
  },
  {
    id: '50000000-0000-0000-0000-000000000002',
    shop_id: '10000000-0000-0000-0000-000000000001',
    customer_id: '00000000-0000-0000-0000-000000000005',
    barber_id: null,
    service_id: '40000000-0000-0000-0000-000000000002',
    guest_name: null,
    guest_phone: null,
    queue_number: 2,
    status: 'waiting',
    qr_code_token: 'TOKEN-002',
    checked_in_at: '2026-10-22T09:30:00Z',
    called_at: null,
    completed_at: null,
    is_walkin: false,
    is_billable: false,
    queue_date: '2026-10-22',
    created_at: '2026-10-22T09:10:00Z',
    updated_at: '2026-10-22T09:30:00Z'
  },
  {
    id: '50000000-0000-0000-0000-000000000003',
    shop_id: '10000000-0000-0000-0000-000000000001',
    customer_id: null,
    barber_id: null,
    service_id: '40000000-0000-0000-0000-000000000001',
    guest_name: 'Anand Kumar',
    guest_phone: '+91 94444 33333',
    queue_number: 99,
    status: 'completed',
    qr_code_token: 'TOKEN-WALKIN',
    checked_in_at: '2026-10-22T08:30:00Z',
    called_at: '2026-10-22T08:35:00Z',
    completed_at: '2026-10-22T08:58:00Z',
    is_walkin: true,
    is_billable: false,
    queue_date: '2026-10-22',
    created_at: '2026-10-22T08:30:00Z',
    updated_at: '2026-10-22T08:58:00Z'
  },
  {
    id: '50000000-0000-0000-0000-000000000004',
    shop_id: '10000000-0000-0000-0000-000000000001',
    customer_id: '00000000-0000-0000-0000-000000000004',
    barber_id: null,
    service_id: '40000000-0000-0000-0000-000000000001',
    guest_name: null,
    guest_phone: null,
    queue_number: 88,
    status: 'completed',
    qr_code_token: 'TOKEN-VERIFIED',
    checked_in_at: '2026-10-22T08:00:00Z',
    called_at: '2026-10-22T08:05:00Z',
    completed_at: '2026-10-22T08:28:00Z',
    is_walkin: false,
    is_billable: true,
    queue_date: '2026-10-22',
    created_at: '2026-10-22T07:45:00Z',
    updated_at: '2026-10-22T08:28:00Z'
  }
];

const MOCK_FEE_RECORDS: FeeRecord[] = [
  {
    id: '60000000-0000-0000-0000-000000000001',
    shop_id: '10000000-0000-0000-0000-000000000001',
    month: '2026-10',
    billable_count: 148,
    rate_per_service: 5.0,
    amount: 740.0,
    status: 'pending',
    disputed_until: '2026-10-28T00:00:00Z',
    dispute_reason: null,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z'
  },
  {
    id: '60000000-0000-0000-0000-000000000002',
    shop_id: '10000000-0000-0000-0000-000000000001',
    month: '2026-09',
    billable_count: 310,
    rate_per_service: 5.0,
    amount: 1550.0,
    status: 'paid',
    disputed_until: '2026-10-07T00:00:00Z',
    dispute_reason: null,
    created_at: '2026-09-30T00:00:00Z',
    updated_at: '2026-10-05T00:00:00Z'
  }
];

const MOCK_PAYMENTS: Payment[] = [
  {
    id: '70000000-0000-0000-0000-000000000001',
    fee_record_id: '60000000-0000-0000-0000-000000000002',
    shop_id: '10000000-0000-0000-0000-000000000001',
    amount: 1550.0,
    currency: 'INR',
    status: 'success',
    payment_method: 'UPI',
    transaction_ref: 'UPI-98234-QC-SETTLE',
    paid_at: '2026-10-05T14:30:00Z',
    created_at: '2026-10-05T14:30:00Z'
  }
];

const MOCK_TICKETS: SupportTicket[] = [
  {
    id: '80000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    shop_id: '10000000-0000-0000-0000-000000000001',
    subject: 'Inquiry about Fixed Tablet QR Scanner Support',
    message: 'Can we install a continuous customer barcode scanner at our front desk kiosk? Does staff app integrate with BLE hardware?',
    status: 'open',
    priority: 'medium',
    created_at: '2026-10-22T08:00:00Z',
    updated_at: '2026-10-22T08:00:00Z'
  }
];

const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: '90000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000001',
    action: 'SHOP_APPROVED',
    entity_type: 'shops',
    entity_id: '10000000-0000-0000-0000-000000000001',
    payload: { shop_name: 'Crown & Blade Barbershop', reviewer: 'admin' },
    ip_address: 'admin-console',
    created_at: '2026-10-01T10:00:00Z'
  },
  {
    id: '90000000-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000001',
    action: 'MONTHLY_BILLING_GENERATED',
    entity_type: 'fee_records',
    entity_id: '60000000-0000-0000-0000-000000000001',
    payload: { month: '2026-10', rate: 5.0, total_shops: 1 },
    ip_address: 'admin-console',
    created_at: '2026-10-20T00:00:00Z'
  }
];

export default function AdminApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Platform State
  const [activeTab, setActiveTab] = useState<
    'shops' | 'accounts' | 'activity' | 'revenue' | 'fraud' | 'tickets' | 'settings' | 'logs'
  >('shops');

  const [shops, setShops] = useState<Shop[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const supabase = getSupabaseClient();

  // 1. Initial Auth Check (Strict backend role verification)
  useEffect(() => {
    const checkInitialSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const { data: profileData, error: profErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();

          if (!profErr && profileData && (profileData as unknown as Profile).role === 'admin') {
            setCurrentUser(data.session.user);
            setCurrentProfile(profileData as unknown as Profile);
          } else {
            // Not an admin: clear state
            setCurrentUser(null);
            setCurrentProfile(null);
          }
        }
      } catch (err) {
        console.warn('Session verification fallback:', err);
      } finally {
        setAuthChecking(false);
      }
    };

    checkInitialSession();
  }, [supabase]);

  // 2. Fetch Live Supabase Data when Admin Logged In
  const loadPlatformData = useCallback(async () => {
    try {
      const [
        shopsRes,
        profilesRes,
        servicesRes,
        queueRes,
        feesRes,
        paymentsRes,
        ticketsRes,
        logsRes
      ] = await Promise.all([
        supabase.from('shops').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('services').select('*').order('created_at', { ascending: false }),
        supabase.from('queue_entries').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('fee_records').select('*').order('created_at', { ascending: false }),
        supabase.from('payments').select('*').order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
      ]);

      const liveShops = (shopsRes.data as unknown as Shop[]) || [];
      const liveProfiles = (profilesRes.data as unknown as Profile[]) || [];
      const liveServices = (servicesRes.data as unknown as Service[]) || [];
      const liveQueue = (queueRes.data as unknown as QueueEntry[]) || [];
      const liveFees = (feesRes.data as unknown as FeeRecord[]) || [];
      const livePayments = (paymentsRes.data as unknown as Payment[]) || [];
      const liveTickets = (ticketsRes.data as unknown as SupportTicket[]) || [];
      const liveLogs = (logsRes.data as unknown as AuditLog[]) || [];

      // If database has live data, display it; if completely unpopulated, allow previewing demonstration data
      if (liveShops.length === 0 && liveProfiles.length === 0 && liveQueue.length === 0) {
        setIsDemoMode(true);
        setShops(MOCK_SHOPS);
        setProfiles(MOCK_PROFILES);
        setServices(MOCK_SERVICES);
        setQueueEntries(MOCK_QUEUE_ENTRIES);
        setFeeRecords(MOCK_FEE_RECORDS);
        setPayments(MOCK_PAYMENTS);
        setTickets(MOCK_TICKETS);
        setLogs(MOCK_AUDIT_LOGS);
      } else {
        setIsDemoMode(false);
        setShops(liveShops);
        setProfiles(liveProfiles);
        setServices(liveServices);
        setQueueEntries(liveQueue);
        setFeeRecords(liveFees);
        setPayments(livePayments);
        setTickets(liveTickets);
        setLogs(liveLogs);
      }
    } catch (err) {
      console.warn('Supabase data load error:', err);
    }
  }, [supabase]);

  useEffect(() => {
    if (currentUser && currentProfile) {
      loadPlatformData();
    }
  }, [currentUser, currentProfile, loadPlatformData]);

  // 3. Supabase Realtime Subscription
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('admin-platform-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setQueueEntries((prev) => [payload.new as QueueEntry, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setQueueEntries((prev) =>
            prev.map((item) => (item.id === payload.new.id ? (payload.new as QueueEntry) : item))
          );
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setShops((prev) =>
            prev.map((s) => (s.id === payload.new.id ? (payload.new as Shop) : s))
          );
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setLogs((prev) => [payload.new as AuditLog, ...prev]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUser]);

  // Auth Callbacks
  const handleLoginSuccess = (user: User, profile: Profile) => {
    setCurrentUser(user);
    setCurrentProfile(profile);
  };

  const handleSignOut = async () => {
    if (currentUser) {
      await logAdminAction(currentUser.id, 'ADMIN_LOGOUT', 'auth', currentUser.id, {
        timestamp: new Date().toISOString()
      });
    }
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentProfile(null);
  };

  // State Updates from Components
  const handleShopUpdated = (updated: Shop) => {
    setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    // Prepend local audit entry
    const localLog: AuditLog = {
      id: `local-log-${Date.now()}`,
      user_id: currentUser?.id || 'admin',
      action: `SHOP_${updated.status.toUpperCase()}`,
      entity_type: 'shops',
      entity_id: updated.id,
      payload: { shop_name: updated.name, status: updated.status },
      ip_address: 'admin-console',
      created_at: new Date().toISOString()
    };
    setLogs((prev) => [localLog, ...prev]);
  };

  const handleProfileUpdated = (updated: Profile) => {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    const localLog: AuditLog = {
      id: `local-log-${Date.now()}`,
      user_id: currentUser?.id || 'admin',
      action: 'PROFILE_ROLE_UPDATED',
      entity_type: 'profiles',
      entity_id: updated.id,
      payload: { full_name: updated.full_name, role: updated.role },
      ip_address: 'admin-console',
      created_at: new Date().toISOString()
    };
    setLogs((prev) => [localLog, ...prev]);
  };

  const handleQueueEntryUpdated = (updated: QueueEntry) => {
    setQueueEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleFeeRecordUpdated = (updated: FeeRecord) => {
    setFeeRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleTicketUpdated = (updated: SupportTicket) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleSuspendShopFromAnomaly = (shopId: string) => {
    const targetShop = shops.find((s) => s.id === shopId);
    if (!targetShop) return;
    handleShopUpdated({ ...targetShop, status: 'suspended', updated_at: new Date().toISOString() });
    alert(`Barbershop "${targetShop.name}" has been suspended pending review.`);
  };

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--accent-indigo)',
          fontSize: 18,
          fontWeight: 700
        }}
      >
        Verifying Super Admin Authorization...
      </div>
    );
  }

  // Not authenticated as Admin -> Show AdminAuthScreen
  if (!currentUser || !currentProfile) {
    return <AdminAuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Aggregate Metrics for Top Bar
  const totalRevenue = feeRecords.reduce((sum, r) => sum + r.amount, 0);
  const totalBillableCuts = queueEntries.filter((e) => e.is_billable).length;
  const pendingApprovals = shops.filter((s) => s.status === 'pending').length;
  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const activeDisputes = feeRecords.filter((r) => r.status === 'disputed').length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(7, 10, 19, 0.96)',
          backdropFilter: 'blur(16px)',
          padding: '14px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        {/* Left Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
              color: '#FFFFFF',
              fontWeight: 900,
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 16,
              boxShadow: '0 4px 14px var(--accent-indigo-glow)'
            }}
          >
            QC
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF' }}>QuickCut Super Admin</h1>
              <span className="badge badge-admin">Master Console</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Logged in: <strong>{currentProfile.full_name}</strong> ({currentUser.email})
            </p>
          </div>
        </div>

        {/* Center Nav Tabs */}
        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'shops', label: `Shops (${pendingApprovals > 0 ? `${pendingApprovals} pending` : shops.length})` },
            { id: 'accounts', label: `Accounts (${profiles.length})` },
            { id: 'activity', label: 'Live Traffic' },
            { id: 'revenue', label: 'Revenue (₹5/cut)' },
            { id: 'fraud', label: 'Fraud Watch' },
            { id: 'tickets', label: `Disputes & Tickets (${activeDisputes + openTickets})` },
            { id: 'settings', label: 'Settings' },
            { id: 'logs', label: 'Audit Trail' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                background: activeTab === tab.id ? 'var(--accent-indigo)' : 'transparent',
                color: activeTab === tab.id ? '#FFFFFF' : 'var(--text-secondary)',
                border: activeTab === tab.id ? 'none' : '1px solid transparent'
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right Sign Out */}
        <div>
          <button
            onClick={handleSignOut}
            style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--accent-rose)',
              padding: '6px 14px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Demonstration Data Banner (Phase 6 requirement) */}
      {isDemoMode && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.12)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '10px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#FCD34D',
            fontSize: 13,
            fontWeight: 600,
            flexWrap: 'wrap',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span>
            <span>
              <strong>Demonstration Data View:</strong> Database tables are currently empty or in dev mode. Displaying verified sample figures.
            </span>
          </div>
          <button
            onClick={() => {
              setIsDemoMode(false);
              setShops([]);
              setProfiles([]);
              setServices([]);
              setQueueEntries([]);
              setFeeRecords([]);
              setPayments([]);
              setTickets([]);
              setLogs([]);
            }}
            style={{
              background: 'rgba(245, 158, 11, 0.25)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Switch to Live Empty DB
          </button>
        </div>
      )}

      {/* Main Admin Workspace */}
      <main style={{ padding: '28px', maxWidth: 1280, margin: '0 auto', width: '100%', flex: 1 }}>
        {/* Top 4 Global KPI Cards */}
        <div className="stats-grid">
          <div className="glass-panel" style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>BARBERSHOP NETWORK</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>{shops.length}</p>
            <p style={{ fontSize: 12, color: pendingApprovals > 0 ? 'var(--accent-amber)' : 'var(--accent-green)', marginTop: 4 }}>
              {pendingApprovals > 0 ? `⚠️ ${pendingApprovals} Pending Approval` : '✓ All shops approved'}
            </p>
          </div>

          <div className="glass-panel" style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>BILLABLE HAIRCUTS (TOTAL)</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-green)', marginTop: 4 }}>
              {totalBillableCuts}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              QR Check-in + Staff verified
            </p>
          </div>

          <div className="glass-panel" style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>PLATFORM REVENUE BILLED</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-indigo)', marginTop: 4 }}>
              {formatFeeAmount(totalRevenue)}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Fixed rate: ₹5.00 INR/cut</p>
          </div>

          <div className="glass-panel" style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>PENDING DISPUTES & TICKETS</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: activeDisputes + openTickets > 0 ? 'var(--accent-rose)' : 'var(--accent-green)', marginTop: 4 }}>
              {activeDisputes + openTickets}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {activeDisputes} fee disputes • {openTickets} support tickets
            </p>
          </div>
        </div>

        {/* Tab 1: Shop Approvals & Suspensions */}
        {activeTab === 'shops' && (
          <ShopManagement
            adminId={currentUser.id}
            shops={shops}
            profiles={profiles}
            onShopUpdated={handleShopUpdated}
          />
        )}

        {/* Tab 2: User Account Management */}
        {activeTab === 'accounts' && (
          <AccountManagement
            adminId={currentUser.id}
            profiles={profiles}
            onProfileUpdated={handleProfileUpdated}
          />
        )}

        {/* Tab 3: Platform Live Activity */}
        {activeTab === 'activity' && (
          <PlatformActivity
            shops={shops}
            queueEntries={queueEntries}
            services={services}
            profiles={profiles}
            realtimeConnected={realtimeConnected}
          />
        )}

        {/* Tab 4: Revenue & Fee Ledgers */}
        {activeTab === 'revenue' && (
          <RevenueLedgers
            shops={shops}
            feeRecords={feeRecords}
            payments={payments}
          />
        )}

        {/* Tab 5: Fraud & Anomaly Watchdog */}
        {activeTab === 'fraud' && (
          <AnomalyFraudWatch
            adminId={currentUser.id}
            shops={shops}
            queueEntries={queueEntries}
            profiles={profiles}
            onQueueEntryUpdated={handleQueueEntryUpdated}
            onSuspendShopRequest={handleSuspendShopFromAnomaly}
          />
        )}

        {/* Tab 6: Support Tickets & Fee Disputes */}
        {activeTab === 'tickets' && (
          <TicketsAndDisputes
            adminId={currentUser.id}
            shops={shops}
            feeRecords={feeRecords}
            tickets={tickets}
            onFeeRecordUpdated={handleFeeRecordUpdated}
            onTicketUpdated={handleTicketUpdated}
          />
        )}

        {/* Tab 7: Platform Settings */}
        {activeTab === 'settings' && (
          <PlatformSettings adminId={currentUser.id} />
        )}

        {/* Tab 8: Security Audit Logs */}
        {activeTab === 'logs' && (
          <AuditLogViewer logs={logs} />
        )}
      </main>
    </div>
  );
}
