import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shop,
  Service,
  Barber,
  ShopStaff,
  QueueEntryWithDetails,
  FeeRecord,
  Payment,
  formatFeeAmount,
  isFeeDisputable,
  getSupabaseClient
} from '@quickcut/shared';
import { OwnerAuthScreen } from './screens/OwnerAuthScreen';
import { SubmitShopModal } from './components/SubmitShopModal';
import { ServiceModal } from './components/ServiceModal';
import { DisputeModal } from './components/DisputeModal';
import { StaffBarberManager } from './components/StaffBarberManager';

export default function OwnerApp() {
  // Auth state
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<
    'stats' | 'queue' | 'history' | 'services' | 'staff' | 'fees'
  >('stats');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Shop state (RLS: Owner only sees their own shops)
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  // Data for active shop
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [staff, setStaff] = useState<
    (ShopStaff & { profile?: { full_name: string; phone: string } })[]
  >([]);
  const [liveQueue, setLiveQueue] = useState<QueueEntryWithDetails[]>([]);
  const [allQueueEntries, setAllQueueEntries] = useState<QueueEntryWithDetails[]>([]);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Filters
  const [historyFilter, setHistoryFilter] = useState<'today' | '7days' | 'month' | 'all'>('today');

  // Modals
  const [submitShopModalOpen, setSubmitShopModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<Service | null>(null);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [selectedFeeRecord, setSelectedFeeRecord] = useState<FeeRecord | null>(null);

  const supabase = getSupabaseClient();
  const activeShop = shops.find((s) => s.id === activeShopId) || shops[0] || null;

  // 1. Check Session & Auth Listener
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSessionUser({
            id: session.user.id,
            email: session.user.email || ''
          });
        } else {
          setSessionUser(null);
        }
      } catch (err) {
        console.warn('Session check error:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSessionUser({
          id: session.user.id,
          email: session.user.email || ''
        });
      } else {
        setSessionUser(null);
      }
      setAuthLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 2. Load Owner's Shops (RLS: owner_id = auth.uid())
  const loadOwnerShops = useCallback(async () => {
    if (!sessionUser) return;
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', sessionUser.id)
        .order('name');

      if (error) throw error;
      const loadedShops = (data as unknown as Shop[]) || [];
      setShops(loadedShops);

      if (loadedShops.length > 0 && !activeShopId) {
        setActiveShopId(loadedShops[0].id);
      }
    } catch (err) {
      console.warn('Error loading owner shops:', err);
    }
  }, [sessionUser, activeShopId]);

  useEffect(() => {
    if (sessionUser) {
      loadOwnerShops();
    }
  }, [sessionUser, loadOwnerShops]);

  // 3. Load Active Shop Data
  const loadShopDetails = useCallback(async () => {
    if (!activeShop) return;

    try {
      // Services
      const { data: svcData } = await supabase
        .from('services')
        .select('*')
        .eq('shop_id', activeShop.id)
        .order('price');
      setServices((svcData as unknown as Service[]) || []);

      // Barbers
      const { data: barberData } = await supabase
        .from('barbers')
        .select('*')
        .eq('shop_id', activeShop.id);
      setBarbers((barberData as unknown as Barber[]) || []);

      // Staff
      const { data: staffData } = await supabase
        .from('shop_staff')
        .select('*, profile:profiles(full_name, phone)')
        .eq('shop_id', activeShop.id);
      setStaff((staffData as any) || []);

      // Live Queue (Waiting & In-Service)
      const { data: queueData } = await supabase
        .from('queue_entries')
        .select(`
          *,
          service:services(*),
          barber:barbers(*)
        `)
        .eq('shop_id', activeShop.id)
        .in('status', ['waiting', 'in_service'])
        .order('queue_number', { ascending: true });
      setLiveQueue((queueData as unknown as QueueEntryWithDetails[]) || []);

      // All Entries (for Completed List, Stats, and Billing audit)
      const { data: allData } = await supabase
        .from('queue_entries')
        .select(`
          *,
          service:services(*),
          barber:barbers(*)
        `)
        .eq('shop_id', activeShop.id)
        .order('created_at', { ascending: false });
      setAllQueueEntries((allData as unknown as QueueEntryWithDetails[]) || []);

      // Monthly Fee Records
      const { data: feeData } = await supabase
        .from('fee_records')
        .select('*')
        .eq('shop_id', activeShop.id)
        .order('month', { ascending: false });
      setFeeRecords((feeData as unknown as FeeRecord[]) || []);

      // Payment Records
      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .eq('shop_id', activeShop.id)
        .order('paid_at', { ascending: false });
      setPayments((paymentData as unknown as Payment[]) || []);
    } catch (err) {
      console.warn('Error loading shop data:', err);
    }
  }, [activeShop]);

  useEffect(() => {
    if (activeShop) {
      loadShopDetails();

      // Realtime subscription for shop queue updates
      const channel = supabase
        .channel(`owner-queue-${activeShop.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'queue_entries',
            filter: `shop_id=eq.${activeShop.id}`
          },
          () => {
            loadShopDetails();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeShop, loadShopDetails]);

  // Remove Service
  const handleRemoveService = async (serviceId: string) => {
    if (!confirm('Are you sure you want to remove this service from your shop?')) return;
    try {
      const { error } = await (supabase.from('services') as any).delete().eq('id', serviceId);
      if (error) throw error;
      loadShopDetails();
    } catch (err) {
      alert('Error removing service');
    }
  };

  // Pay Fee Statement (Settle via Mock UPI)
  const handlePayFeeRecord = async (feeRecord: FeeRecord) => {
    try {
      // 1. Create payment record
      const { error: payErr } = await (supabase.from('payments') as any).insert({
        fee_record_id: feeRecord.id,
        shop_id: feeRecord.shop_id,
        amount: feeRecord.amount,
        currency: 'INR',
        status: 'completed',
        payment_method: 'UPI',
        transaction_ref: `UPI/${new Date().getFullYear()}/${Math.floor(10000000 + Math.random() * 90000000)}`
      });
      if (payErr) throw payErr;

      // 2. Update fee record status
      await (supabase.from('fee_records') as any)
        .update({ status: 'paid' })
        .eq('id', feeRecord.id);

      alert(`Payment of ${formatFeeAmount(feeRecord.amount)} completed successfully via UPI!`);
      loadShopDetails();
    } catch (err) {
      alert('Error recording payment');
    }
  };

  // 4. Compute Statistics: Services per day, Busiest hours, No-show rate
  const statistics = useMemo(() => {
    const totalEntries = allQueueEntries.length;
    const completedEntries = allQueueEntries.filter((e) => e.status === 'completed');
    const noShowEntries = allQueueEntries.filter((e) => e.status === 'no_show');
    const walkinEntries = allQueueEntries.filter((e) => e.is_walkin);
    const billableEntries = allQueueEntries.filter((e) => e.is_billable);

    // No-show rate
    const noShowRate = totalEntries > 0 ? ((noShowEntries.length / totalEntries) * 100).toFixed(1) : '0.0';

    // Services per day (last 7 days)
    const daysMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = d.toLocaleDateString('en-US', { weekday: 'short' });
      daysMap[dayKey] = 0;
    }

    completedEntries.forEach((e) => {
      const dayKey = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'short' });
      if (daysMap[dayKey] !== undefined) {
        daysMap[dayKey] += 1;
      }
    });

    const maxDaily = Math.max(...Object.values(daysMap), 1);

    // Busiest hours histogram (9 AM to 9 PM)
    const hoursMap: Record<number, number> = {
      9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0
    };

    allQueueEntries.forEach((e) => {
      const hour = new Date(e.created_at).getHours();
      if (hoursMap[hour] !== undefined) {
        hoursMap[hour] += 1;
      }
    });

    const maxHourly = Math.max(...Object.values(hoursMap), 1);

    return {
      totalEntries,
      completedCount: completedEntries.length,
      noShowCount: noShowEntries.length,
      noShowRate,
      walkinCount: walkinEntries.length,
      billableCount: billableEntries.length,
      daysMap,
      maxDaily,
      hoursMap,
      maxHourly
    };
  }, [allQueueEntries]);

  // 5. Filtered Completed Services List
  const filteredCompletedServices = useMemo(() => {
    const now = new Date();
    return allQueueEntries.filter((entry) => {
      if (entry.status !== 'completed') return false;
      const created = new Date(entry.created_at);

      if (historyFilter === 'today') {
        return created.toDateString() === now.toDateString();
      }
      if (historyFilter === '7days') {
        const diffDays = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7;
      }
      if (historyFilter === 'month') {
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [allQueueEntries, historyFilter]);

  // Auth Loading
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>Loading QuickCut Owner Portal...</p>
      </div>
    );
  }

  // Not Logged In
  if (!sessionUser) {
    return <OwnerAuthScreen onAuthSuccess={loadOwnerShops} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(11, 15, 25, 0.95)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}
      >
        {/* Brand & Shop Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: '#0A0F1D',
              fontWeight: 900,
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 16
            }}
          >
            QC
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {shops.length > 0 ? (
                <select
                  value={activeShopId || ''}
                  onChange={(e) => setActiveShopId(e.target.value)}
                  style={{
                    fontWeight: 700,
                    color: '#FFFFFF',
                    background: '#131B2E',
                    fontSize: 15,
                    border: '1px solid var(--border-color)'
                  }}
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>No Shops Registered</span>
              )}

              {activeShop && (
                <span className={`badge badge-${activeShop.status}`}>{activeShop.status}</span>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Owner: {sessionUser.email}
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center'
          }}
          className="desktop-nav"
        >
          {[
            { id: 'stats', label: '📊 Statistics' },
            { id: 'queue', label: `✂️ Live Queue (${liveQueue.length})` },
            { id: 'history', label: '🗓 Completed' },
            { id: 'services', label: '💈 Services' },
            { id: 'staff', label: '👥 Barbers & Staff' },
            { id: 'fees', label: '💰 Platform Fees' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: activeTab === tab.id ? 'var(--accent-gold)' : 'transparent',
                color: activeTab === tab.id ? '#0A0F1D' : 'var(--text-secondary)',
                border: activeTab === tab.id ? 'none' : '1px solid transparent'
              }}
            >
              {tab.label}
            </button>
          ))}

          <button
            onClick={() => setSubmitShopModalOpen(true)}
            style={{
              background: '#1E293B',
              border: '1px solid var(--accent-gold)',
              color: 'var(--accent-gold)',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              marginLeft: 8
            }}
          >
            + New Shop
          </button>

          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Sign Out
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '24px', maxWidth: 1240, margin: '0 auto', width: '100%', flex: 1 }}>
        {/* Pending Review Alert Banner */}
        {activeShop?.status === 'pending' && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid var(--accent-gold)',
              borderRadius: 12,
              padding: '14px 20px',
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <p style={{ color: 'var(--accent-gold)', fontWeight: 800, fontSize: 14 }}>
                ⏳ Shop Pending Platform Approval
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                &quot;{activeShop.name}&quot; has been submitted and is currently being reviewed by platform admins. Customers will be able to discover and join queues once approved.
              </p>
            </div>
          </div>
        )}

        {/* Tab 1: Statistics Dashboard */}
        {activeTab === 'stats' && (
          <div>
            {/* KPI Cards Row */}
            <div className="stats-grid">
              <div className="glass-panel" style={{ padding: 20 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>ACTIVE QUEUE</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent-blue)', marginTop: 4 }}>
                  {liveQueue.length}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Currently waiting or seated</p>
              </div>

              <div className="glass-panel" style={{ padding: 20 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>COMPLETED CUTS</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent-green)', marginTop: 4 }}>
                  {statistics.completedCount}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {statistics.billableCount} platform billable cuts
                </p>
              </div>

              <div className="glass-panel" style={{ padding: 20 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>NO-SHOW RATE</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent-red)', marginTop: 4 }}>
                  {statistics.noShowRate}%
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {statistics.noShowCount} missed appointments
                </p>
              </div>

              <div className="glass-panel" style={{ padding: 20 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>PLATFORM FEES (₹5/CUT)</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent-gold)', marginTop: 4 }}>
                  {formatFeeAmount(statistics.billableCount * 5.0)}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {statistics.walkinCount} walk-ins (exempt)
                </p>
              </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Chart 1: Services Per Day (Last 7 Days) */}
              <div className="glass-panel">
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Services Completed Per Day</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Daily trend over the past 7 days
                </p>

                <div className="bar-chart-container">
                  {Object.entries(statistics.daysMap).map(([day, count]) => {
                    const heightPercent = Math.max(8, (count / statistics.maxDaily) * 100);
                    return (
                      <div key={day} className="bar-column">
                        <span className="bar-value">{count}</span>
                        <div className="bar-fill" style={{ height: `${heightPercent}%` }} />
                        <span className="bar-label">{day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 2: Busiest Hours */}
              <div className="glass-panel">
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Busiest Shop Hours</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Booking and check-in volume by time of day (09:00 - 20:00)
                </p>

                <div className="bar-chart-container">
                  {Object.entries(statistics.hoursMap).map(([hour, count]) => {
                    const heightPercent = Math.max(8, (count / statistics.maxHourly) * 100);
                    const formattedHour = `${parseInt(hour, 10) > 12 ? parseInt(hour, 10) - 12 : hour}${parseInt(hour, 10) >= 12 ? 'p' : 'a'}`;
                    return (
                      <div key={hour} className="bar-column">
                        <span className="bar-value">{count}</span>
                        <div className="bar-fill bar-fill-blue" style={{ height: `${heightPercent}%` }} />
                        <span className="bar-label">{formattedHour}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Live Queue Monitor */}
        {activeTab === 'queue' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>Live Queue: {activeShop?.name}</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Real-time updates via Supabase Realtime channel
                </p>
              </div>
              <span className="badge badge-approved">● Live Stream Active</span>
            </div>

            <div className="glass-panel" style={{ padding: 0 }}>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Token #</th>
                      <th>Customer / Guest</th>
                      <th>Service Selected</th>
                      <th>Queue Status</th>
                      <th>QR Check-in</th>
                      <th>Platform Fee Eligibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveQueue.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ fontWeight: 800, color: 'var(--accent-gold)' }}>
                          #{entry.queue_number}
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {entry.guest_name || 'App Customer'}
                          {entry.is_walkin && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-blue)' }}>
                              (Walk-in)
                            </span>
                          )}
                        </td>
                        <td>
                          {entry.service?.name} (~{entry.service?.avg_minutes}m) • ₹{entry.service?.price}
                        </td>
                        <td>
                          <span className={`badge badge-${entry.status}`}>{entry.status}</span>
                        </td>
                        <td>
                          {entry.checked_in_at ? (
                            <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>✓ Verified</span>
                          ) : (
                            <span style={{ color: 'var(--accent-gold)' }}>Pending Arrival</span>
                          )}
                        </td>
                        <td>
                          {entry.is_walkin ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Exempt (Walk-in)</span>
                          ) : entry.checked_in_at ? (
                            <span style={{ color: 'var(--accent-green)', fontSize: 12, fontWeight: 700 }}>
                              Eligible (₹5.00)
                            </span>
                          ) : (
                            <span style={{ color: 'var(--accent-gold)', fontSize: 12 }}>
                              Pending QR Check-in
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {liveQueue.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                          No active queue entries in this shop right now.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Completed Services List with Date Filters */}
        {activeTab === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>Completed Services Log</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  View fulfilled haircut records and verify billable qualifications
                </p>
              </div>

              {/* Date Filters */}
              <div style={{ display: 'flex', gap: 6, background: '#111827', padding: 4, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                {(['today', '7days', 'month', 'all'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: historyFilter === filter ? 'var(--accent-gold)' : 'transparent',
                      color: historyFilter === filter ? '#0A0F1D' : 'var(--text-secondary)'
                    }}
                  >
                    {filter === 'today' ? 'Today' : filter === '7days' ? 'Last 7 Days' : filter === 'month' ? 'This Month' : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: 0 }}>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Ticket #</th>
                      <th>Date & Time</th>
                      <th>Customer</th>
                      <th>Service</th>
                      <th>QR Check-in</th>
                      <th>Platform Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompletedServices.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ fontWeight: 800, color: 'var(--accent-gold)' }}>
                          #{entry.queue_number}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          {new Date(entry.completed_at || entry.created_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {entry.guest_name || 'App Customer'}
                          {entry.is_walkin && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-blue)' }}>
                              (Walk-in)
                            </span>
                          )}
                        </td>
                        <td>
                          {entry.service?.name} (₹{entry.service?.price})
                        </td>
                        <td>
                          {entry.checked_in_at ? (
                            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>✓ Yes</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>No</span>
                          )}
                        </td>
                        <td>
                          {entry.is_billable ? (
                            <span className="badge badge-completed">₹5.00 Billable</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                              ₹0.00 (Walk-in / No QR)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {filteredCompletedServices.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                          No completed services match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Services Catalog Management */}
        {activeTab === 'services' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>Services & Pricing Catalog</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Add, edit, or adjust pricing and estimated durations for your shop
                </p>
              </div>

              <button
                onClick={() => {
                  setServiceToEdit(null);
                  setServiceModalOpen(true);
                }}
                style={{
                  background: 'var(--accent-gold)',
                  color: '#0A0F1D',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14
                }}
              >
                + Add New Service
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {services.map((svc) => (
                <div key={svc.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800 }}>{svc.name}</h3>
                      <span className={`badge ${svc.is_active ? 'badge-approved' : 'badge-suspended'}`}>
                        {svc.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-gold)', margin: '12px 0 6px 0' }}>
                      ₹{svc.price}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Estimated Time: <strong style={{ color: '#FFFFFF' }}>{svc.avg_minutes} mins</strong>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => {
                        setServiceToEdit(svc);
                        setServiceModalOpen(true);
                      }}
                      style={{
                        flex: 1,
                        background: '#1E293B',
                        color: 'var(--text-primary)',
                        padding: '8px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleRemoveService(svc.id)}
                      style={{
                        background: 'transparent',
                        color: 'var(--accent-red)',
                        padding: '8px',
                        fontSize: 13,
                        fontWeight: 600
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Barbers and Staff Accounts */}
        {activeTab === 'staff' && activeShop && (
          <StaffBarberManager
            shopId={activeShop.id}
            barbers={barbers}
            staff={staff}
            onReload={loadShopDetails}
          />
        )}

        {/* Tab 6: Platform Fees Statement & Payments */}
        {activeTab === 'fees' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>Platform Monthly Fee Statements</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Platform fee invariant: <strong>₹5.00 per billable service</strong> (App booking + QR check-in arrival + completion). Walk-ins and no-shows are exempt.
                </p>
              </div>
            </div>

            {/* Fee Statements Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
              {feeRecords.map((record) => {
                const canDispute = isFeeDisputable(record);

                return (
                  <div key={record.id} className="glass-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: 16, marginBottom: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 800 }}>Statement Month: {record.month}</h3>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          Invoice ID: {record.id.slice(0, 8)}... • Generated {new Date(record.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <span className={`badge badge-${record.status}`}>
                        {record.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                      <div style={{ background: '#0D1424', padding: 14, borderRadius: 10 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Billable Cuts</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>
                          {record.billable_count} services
                        </p>
                      </div>
                      <div style={{ background: '#0D1424', padding: 14, borderRadius: 10 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fixed Rate</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-gold)', marginTop: 4 }}>
                          ₹5.00 / cut
                        </p>
                      </div>
                      <div style={{ background: '#0D1424', padding: 14, borderRadius: 10 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Amount</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-green)', marginTop: 4 }}>
                          {formatFeeAmount(record.amount)}
                        </p>
                      </div>
                    </div>

                    {record.dispute_reason && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-red)' }}>Dispute Filed:</p>
                        <p style={{ fontSize: 13, color: '#FFFFFF', marginTop: 2 }}>{record.dispute_reason}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        7-Day Dispute Window Closes:{' '}
                        <strong style={{ color: '#FFFFFF' }}>{new Date(record.disputed_until).toLocaleDateString()}</strong>{' '}
                        ({canDispute ? 'Active' : 'Closed'})
                      </p>

                      <div style={{ display: 'flex', gap: 10 }}>
                        {canDispute && record.status !== 'disputed' && (
                          <button
                            onClick={() => {
                              setSelectedFeeRecord(record);
                              setDisputeModalOpen(true);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--accent-red)',
                              color: 'var(--accent-red)',
                              padding: '8px 16px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 700
                            }}
                          >
                            Dispute Entry (7-Day Window)
                          </button>
                        )}

                        {record.status !== 'paid' && (
                          <button
                            onClick={() => handlePayFeeRecord(record)}
                            style={{
                              background: 'var(--accent-green)',
                              color: '#0A0F1D',
                              padding: '8px 20px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 800
                            }}
                          >
                            Pay via UPI
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {feeRecords.length === 0 && (
                <div className="glass-panel" style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ color: 'var(--text-muted)' }}>No monthly fee statements generated yet.</p>
                </div>
              )}
            </div>

            {/* Payment Records Section */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Payment Settlement History</h3>
              <div className="glass-panel" style={{ padding: 0 }}>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Transaction Ref</th>
                        <th>Payment Method</th>
                        <th>Amount Paid</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ color: 'var(--text-muted)' }}>
                            {new Date(p.paid_at).toLocaleDateString()}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.transaction_ref}</td>
                          <td>{p.payment_method}</td>
                          <td style={{ fontWeight: 800, color: 'var(--accent-green)' }}>
                            {formatFeeAmount(p.amount)}
                          </td>
                          <td>
                            <span className="badge badge-paid">{p.status}</span>
                          </td>
                        </tr>
                      ))}

                      {payments.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                            No payment transactions recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {sessionUser && (
        <SubmitShopModal
          visible={submitShopModalOpen}
          ownerId={sessionUser.id}
          onClose={() => setSubmitShopModalOpen(false)}
          onShopSubmitted={(newShop) => {
            setShops([...shops, newShop]);
            setActiveShopId(newShop.id);
          }}
        />
      )}

      {activeShop && (
        <ServiceModal
          visible={serviceModalOpen}
          shopId={activeShop.id}
          serviceToEdit={serviceToEdit}
          onClose={() => setServiceModalOpen(false)}
          onSaved={loadShopDetails}
        />
      )}

      <DisputeModal
        visible={disputeModalOpen}
        feeRecord={selectedFeeRecord}
        onClose={() => {
          setDisputeModalOpen(false);
          setSelectedFeeRecord(null);
        }}
        onDisputeSubmitted={loadShopDetails}
      />
    </div>
  );
}
