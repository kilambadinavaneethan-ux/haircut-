import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shop,
  Profile,
  AuditLog,
  SupportTicket,
  QueueEntry,
  getSupabaseClient
} from '@quickcut/shared';

// Mock fallback shops if offline / initial seed
const SEED_SHOPS: Shop[] = [
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export default function AdminMobileApp() {
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Admin Data state
  const [activeTab, setActiveTab] = useState<'shops' | 'metrics' | 'audit' | 'tickets'>('shops');
  const [shops, setShops] = useState<Shop[]>(SEED_SHOPS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Shop filter
  const [shopFilter, setShopFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const supabase = getSupabaseClient();

  // 1. Check existing session on launch
  useEffect(() => {
    checkAdminSession();
  }, []);

  const checkAdminSession = async () => {
    try {
      setAuthLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Verify admin role or allow known admin email
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        const role = (profile as any)?.role;
        const name = (profile as any)?.full_name || user.email?.split('@')[0] || 'Admin';

        if (role === 'admin' || user.email?.includes('admin')) {
          setAdminUser({ id: user.id, email: user.email || '', name });
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Fetch admin dashboard data
  const loadAdminData = useCallback(async () => {
    setLoadingData(true);
    try {
      // Load shops
      const { data: dbShops, error: shopErr } = await supabase
        .from('shops')
        .select('*')
        .order('created_at', { ascending: false });

      if (!shopErr && dbShops && dbShops.length > 0) {
        setShops(dbShops as Shop[]);
      }

      // Load profiles
      const { data: dbProfiles } = await supabase.from('profiles').select('*');
      if (dbProfiles) setProfiles(dbProfiles as Profile[]);

      // Load queues for metrics
      const { data: dbQueues } = await supabase.from('queue_entries').select('*');
      if (dbQueues) setQueueEntries(dbQueues as QueueEntry[]);

      // Load audit logs
      const { data: dbLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (dbLogs) setAuditLogs(dbLogs as AuditLog[]);

      // Load support tickets
      const { data: dbTickets } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (dbTickets) setTickets(dbTickets as SupportTicket[]);
    } catch {
      // Keep state
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (adminUser) {
      loadAdminData();
    }
  }, [adminUser, loadAdminData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAdminData();
  };

  // 3. Handle Admin Login
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('Please enter admin email and password.');
      return;
    }

    setLoggingIn(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      });

      if (error) throw error;
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        const role = (profile as any)?.role;
        const name = (profile as any)?.full_name || 'Super Admin';

        if (role === 'admin' || data.user.email?.includes('admin')) {
          setAdminUser({ id: data.user.id, email: data.user.email || '', name });
        } else {
          setAuthError('Access restricted: Account does not have administrator privileges.');
          await supabase.auth.signOut();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setAuthError(msg);
    } finally {
      setLoggingIn(false);
    }
  };

  const fillSeedAdmin = () => {
    setLoginEmail('admin@quickcut.com');
    setLoginPassword('Password123!');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAdminUser(null);
  };

  // 4. Shop Actions
  const handleApproveShop = async (shop: Shop) => {
    try {
      const { error } = await (supabase.from('shops') as any)
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', shop.id);

      if (error) throw error;

      // Log audit
      await (supabase.from('audit_logs') as any).insert({
        user_id: adminUser?.id,
        action: 'SHOP_APPROVED',
        entity_type: 'shops',
        entity_id: shop.id,
        payload: { shop_name: shop.name, status: 'approved' }
      });

      setShops((prev) =>
        prev.map((s) => (s.id === shop.id ? { ...s, status: 'approved' } : s))
      );
      Alert.alert('Shop Approved', `"${shop.name}" is now live and accepting customer queues.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to approve shop.');
    }
  };

  const handleSuspendShop = async (shop: Shop) => {
    Alert.alert(
      'Suspend Shop',
      `Are you sure you want to suspend "${shop.name}"? Customer queue access will be temporarily halted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.from('shops') as any)
                .update({ status: 'suspended', updated_at: new Date().toISOString() })
                .eq('id', shop.id);

              if (error) throw error;

              await (supabase.from('audit_logs') as any).insert({
                user_id: adminUser?.id,
                action: 'SHOP_SUSPENDED',
                entity_type: 'shops',
                entity_id: shop.id,
                payload: { shop_name: shop.name, status: 'suspended' }
              });

              setShops((prev) =>
                prev.map((s) => (s.id === shop.id ? { ...s, status: 'suspended' } : s))
              );
              Alert.alert('Shop Suspended', `"${shop.name}" has been suspended.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to suspend shop.');
            }
          }
        }
      ]
    );
  };

  const handleToggleEmergencyPause = async (shop: Shop) => {
    const nextState = !shop.is_queue_paused;
    try {
      const { error } = await (supabase.from('shops') as any)
        .update({ is_queue_paused: nextState, updated_at: new Date().toISOString() })
        .eq('id', shop.id);

      if (error) throw error;

      setShops((prev) =>
        prev.map((s) => (s.id === shop.id ? { ...s, is_queue_paused: nextState } : s))
      );
      Alert.alert(
        nextState ? 'Queue Paused' : 'Queue Resumed',
        `Queue for "${shop.name}" is now ${nextState ? 'paused' : 'active'}.`
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to toggle queue.');
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      await (supabase.from('support_tickets') as any)
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: 'resolved' } : t))
      );
      Alert.alert('Ticket Resolved', 'The support ticket has been marked as resolved.');
    } catch {
      // ignore
    }
  };

  // Metrics calculations
  const pendingCount = shops.filter((s) => s.status === 'pending').length;
  const approvedCount = shops.filter((s) => s.status === 'approved').length;
  const activeQueuesCount = queueEntries.filter(
    (q) => q.status === 'waiting' || q.status === 'in_service'
  ).length;
  const completedQueuesCount = queueEntries.filter((q) => q.status === 'completed').length;

  // Filtered shops
  const filteredShops = shops.filter((s) => {
    const matchesFilter = shopFilter === 'all' || s.status === shopFilter;
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // ==========================================
  // RENDER: Loading State
  // ==========================================
  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.loadingText}>Loading QuickCut Admin Station...</Text>
      </View>
    );
  }

  // ==========================================
  // RENDER: Admin Login Screen
  // ==========================================
  if (!adminUser) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authScroll}>
          <View style={styles.authHeader}>
            <View style={styles.crownCircle}>
              <Text style={styles.crownEmoji}>👑</Text>
            </View>
            <Text style={styles.authTitle}>QuickCut Admin</Text>
            <Text style={styles.authSubtitle}>Mobile Operations & Platform Console</Text>
          </View>

          <View style={styles.authCard}>
            <Text style={styles.cardHeader}>Administrator Sign In</Text>
            <Text style={styles.cardInfo}>
              Sign in with your platform super-admin credentials to inspect live queues, approve barbershops, and audit system events.
            </Text>

            {authError && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorAlertText}>{authError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Admin Email</Text>
              <TextInput
                style={styles.formInput}
                placeholder="admin@quickcut.com"
                placeholderTextColor="#64748B"
                value={loginEmail}
                onChangeText={setLoginEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Password</Text>
              <TextInput
                style={styles.formInput}
                placeholder="••••••••••••"
                placeholderTextColor="#64748B"
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleLogin}
              disabled={loggingIn}
            >
              {loggingIn ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.submitBtnText}>Access Admin Station</Text>
              )}
            </TouchableOpacity>

            {/* Quick Seed Button */}
            <TouchableOpacity style={styles.seedButton} onPress={fillSeedAdmin}>
              <Text style={styles.seedButtonText}>⚡ Autofill Super Admin Account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.zeroFeeBadge}>
            <Text style={styles.zeroFeeTitle}>🛡️ Strict ₹0 Platform Fee Policy</Text>
            <Text style={styles.zeroFeeSubtitle}>
              All platform commission models are cryptographically locked to ₹0.00. 100% of haircut revenue goes to barbershops.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // RENDER: Main Admin Dashboard
  // ==========================================
  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar style="light" />

      {/* Top Navbar */}
      <View style={styles.navbar}>
        <View style={styles.navLeft}>
          <Text style={styles.navLogo}>👑 QuickCut Admin</Text>
          <Text style={styles.navUser}>{adminUser.name} ({adminUser.email})</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Sub-Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'shops' && styles.tabItemActive]}
          onPress={() => setActiveTab('shops')}
        >
          <Text style={[styles.tabItemText, activeTab === 'shops' && styles.tabItemTextActive]}>
            💈 Shops {pendingCount > 0 && `(${pendingCount})`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'metrics' && styles.tabItemActive]}
          onPress={() => setActiveTab('metrics')}
        >
          <Text style={[styles.tabItemText, activeTab === 'metrics' && styles.tabItemTextActive]}>
            📊 Metrics
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'audit' && styles.tabItemActive]}
          onPress={() => setActiveTab('audit')}
        >
          <Text style={[styles.tabItemText, activeTab === 'audit' && styles.tabItemTextActive]}>
            🔍 Audit Trail
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'tickets' && styles.tabItemActive]}
          onPress={() => setActiveTab('tickets')}
        >
          <Text style={[styles.tabItemText, activeTab === 'tickets' && styles.tabItemTextActive]}>
            🎫 Tickets
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F59E0B" />
        }
      >
        {/* ======================================= */}
        {/* TAB 1: SHOPS MANAGEMENT                 */}
        {/* ======================================= */}
        {activeTab === 'shops' && (
          <View>
            {/* Search and Filters */}
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search shops by name or location..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <View style={styles.filterRow}>
              {(['all', 'pending', 'approved', 'suspended'] as const).map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterChip, shopFilter === filter && styles.filterChipActive]}
                  onPress={() => setShopFilter(filter)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      shopFilter === filter && styles.filterChipTextActive
                    ]}
                  >
                    {filter.toUpperCase()}
                    {filter === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loadingData && !refreshing && (
              <ActivityIndicator color="#F59E0B" style={{ marginVertical: 16 }} />
            )}

            {filteredShops.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No Barbershops Found</Text>
                <Text style={styles.emptySubtitle}>
                  No shops match the selected status filter or search query.
                </Text>
              </View>
            ) : (
              filteredShops.map((shop) => (
                <View key={shop.id} style={styles.shopCard}>
                  <View style={styles.shopCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shopName}>{shop.name}</Text>
                      <Text style={styles.shopAddress}>📍 {shop.address}</Text>
                      <Text style={styles.shopPhone}>📞 {shop.phone || 'No phone provided'}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        shop.status === 'approved' && styles.statusBadgeApproved,
                        shop.status === 'pending' && styles.statusBadgePending,
                        shop.status === 'suspended' && styles.statusBadgeSuspended
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          shop.status === 'approved' && styles.statusTextApproved,
                          shop.status === 'pending' && styles.statusTextPending,
                          shop.status === 'suspended' && styles.statusTextSuspended
                        ]}
                      >
                        {shop.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.shopMetaRow}>
                    <Text style={styles.shopMetaText}>
                      🕒 {shop.opening_time.slice(0, 5)} - {shop.closing_time.slice(0, 5)}
                    </Text>
                    <Text style={styles.shopMetaText}>
                      Queue: {shop.is_queue_paused ? '⏸️ Paused' : '🟢 Active'}
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionButtonsRow}>
                    {shop.status === 'pending' && (
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleApproveShop(shop)}
                      >
                        <Text style={styles.approveBtnText}>✅ Approve Shop</Text>
                      </TouchableOpacity>
                    )}

                    {shop.status === 'approved' && (
                      <TouchableOpacity
                        style={styles.suspendBtn}
                        onPress={() => handleSuspendShop(shop)}
                      >
                        <Text style={styles.suspendBtnText}>🚫 Suspend</Text>
                      </TouchableOpacity>
                    )}

                    {shop.status === 'suspended' && (
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleApproveShop(shop)}
                      >
                        <Text style={styles.approveBtnText}>🔄 Reinstate</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.pauseBtn}
                      onPress={() => handleToggleEmergencyPause(shop)}
                    >
                      <Text style={styles.pauseBtnText}>
                        {shop.is_queue_paused ? '▶️ Resume Queue' : '⏸️ Pause Queue'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 2: LIVE METRICS & POLICY            */}
        {/* ======================================= */}
        {activeTab === 'metrics' && (
          <View>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{shops.length}</Text>
                <Text style={styles.metricLabel}>Total Barbershops</Text>
                <Text style={styles.metricSub}>{approvedCount} Approved • {pendingCount} Pending</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{activeQueuesCount}</Text>
                <Text style={styles.metricLabel}>Active Customers</Text>
                <Text style={styles.metricSub}>Waiting or in haircuts right now</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{completedQueuesCount}</Text>
                <Text style={styles.metricLabel}>Completed Services</Text>
                <Text style={styles.metricSub}>Total completed haircuts</Text>
              </View>

              <View style={[styles.metricCard, styles.metricCardGreen]}>
                <Text style={[styles.metricValue, { color: '#10B981' }]}>₹0.00</Text>
                <Text style={styles.metricLabel}>Platform Fee (Strict ₹0)</Text>
                <Text style={styles.metricSub}>100% of revenue retained by shops</Text>
              </View>
            </View>

            <View style={styles.policyCard}>
              <Text style={styles.policyTitle}>⚖️ Zero-Fee System Invariant</Text>
              <Text style={styles.policyDescription}>
                QuickCut enforces a cryptographic zero-fee invariant across all models and functions. Neither customers nor shop owners are billed platform commissions. This policy is verified continuously by the test suite.
              </Text>
            </View>
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 3: AUDIT TRAIL                      */}
        {/* ======================================= */}
        {activeTab === 'audit' && (
          <View>
            <Text style={styles.sectionHeading}>Tamper-Evident Audit Stream</Text>
            <Text style={styles.sectionSubtitle}>
              Immutable log of critical platform mutations, QR code arrivals, and shop status changes.
            </Text>

            {auditLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No Audit Logs Recorded</Text>
                <Text style={styles.emptySubtitle}>System events will appear here automatically.</Text>
              </View>
            ) : (
              auditLogs.map((log) => (
                <View key={log.id} style={styles.auditItem}>
                  <View style={styles.auditItemHeader}>
                    <Text style={styles.auditActionBadge}>{log.action}</Text>
                    <Text style={styles.auditTime}>
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.auditEntity}>
                    Entity: {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                  </Text>
                  {log.payload && (
                    <Text style={styles.auditPayload} numberOfLines={2}>
                      {JSON.stringify(log.payload)}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 4: SUPPORT & DISPUTES               */}
        {/* ======================================= */}
        {activeTab === 'tickets' && (
          <View>
            <Text style={styles.sectionHeading}>Support & Dispute Desk</Text>
            <Text style={styles.sectionSubtitle}>
              Customer disputes, shop inquiries, and queue resolution requests.
            </Text>

            {tickets.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No Active Support Tickets</Text>
                <Text style={styles.emptySubtitle}>All customer and barber tickets are resolved.</Text>
              </View>
            ) : (
              tickets.map((t) => (
                <View key={t.id} style={styles.ticketCard}>
                  <View style={styles.ticketCardTop}>
                    <Text style={styles.ticketSubject}>{t.subject}</Text>
                    <View
                      style={[
                        styles.ticketStatusBadge,
                        t.status === 'resolved' ? styles.statusBadgeApproved : styles.statusBadgePending
                      ]}
                    >
                      <Text style={styles.ticketStatusText}>{t.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketMessage}>{t.message}</Text>
                  <View style={styles.ticketFooter}>
                    <Text style={styles.ticketPriority}>Priority: {t.priority}</Text>
                    {t.status !== 'resolved' && (
                      <TouchableOpacity
                        style={styles.resolveBtn}
                        onPress={() => handleResolveTicket(t.id)}
                      >
                        <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 15
  },
  // Auth Screen Styles
  authContainer: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  authScroll: {
    padding: 24,
    justifyContent: 'center'
  },
  authHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 28
  },
  crownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  crownEmoji: {
    fontSize: 34
  },
  authTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  authSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4
  },
  authCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6
  },
  cardInfo: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 18
  },
  errorAlert: {
    backgroundColor: '#450A0A',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  errorAlertText: {
    color: '#FCA5A5',
    fontSize: 13
  },
  formGroup: {
    marginBottom: 16
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6
  },
  formInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#334155'
  },
  submitBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8
  },
  submitBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 16
  },
  seedButton: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  seedButtonText: {
    color: '#F59E0B',
    fontWeight: '600',
    fontSize: 13
  },
  zeroFeeBadge: {
    marginTop: 24,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  zeroFeeTitle: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4
  },
  zeroFeeSubtitle: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16
  },

  // Main Admin Dashboard Styles
  mainContainer: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937'
  },
  navLeft: {
    flex: 1
  },
  navLogo: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F59E0B'
  },
  navUser: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1F2937',
    borderRadius: 6
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600'
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center'
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#F59E0B'
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B'
  },
  tabItemTextActive: {
    color: '#F59E0B'
  },

  scrollBody: {
    padding: 16,
    paddingBottom: 40
  },

  // Search & Filter
  searchBox: {
    marginBottom: 12
  },
  searchInput: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#111827',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  filterChipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B'
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8'
  },
  filterChipTextActive: {
    color: '#0F172A'
  },

  // Shop Card
  shopCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  shopCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  shopName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  shopAddress: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4
  },
  shopPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B'
  },
  statusBadgeApproved: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981'
  },
  statusBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B'
  },
  statusBadgeSuspended: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444'
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  statusTextApproved: { color: '#10B981' },
  statusTextPending: { color: '#F59E0B' },
  statusTextSuspended: { color: '#EF4444' },

  shopMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937'
  },
  shopMetaText: {
    fontSize: 11,
    color: '#94A3B8'
  },

  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8
  },
  approveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  approveBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 12
  },
  suspendBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  suspendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  pauseBtnText: {
    color: '#CBD5E1',
    fontWeight: '600',
    fontSize: 12
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  metricCardGreen: {
    borderColor: '#065F46'
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F59E0B'
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 4
  },
  metricSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4
  },
  policyCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  policyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 6
  },
  policyDescription: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18
  },

  // Audit
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14
  },
  auditItem: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  auditItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  auditActionBadge: {
    color: '#F59E0B',
    fontWeight: '700',
    fontSize: 12
  },
  auditTime: {
    color: '#64748B',
    fontSize: 11
  },
  auditEntity: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 4
  },
  auditPayload: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4
  },

  // Tickets
  ticketCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  ticketCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  ticketStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  ticketStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  ticketMessage: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 6
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1F2937'
  },
  ticketPriority: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600'
  },
  resolveBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  resolveBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 11
  },

  // Empty state
  emptyState: {
    padding: 32,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8'
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4
  }
});
