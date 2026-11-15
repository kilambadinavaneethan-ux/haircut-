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
  Modal,
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

  // Auth form state (Supports Sign In & Create Account)
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signUpFullName, setSignUpFullName] = useState('');
  const [signUpPhone, setSignUpPhone] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('QUICKCUT2026');
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Admin Data state
  const [activeTab, setActiveTab] = useState<'shops' | 'accounts' | 'metrics' | 'audit' | 'tickets'>('shops');
  const [shops, setShops] = useState<Shop[]>(SEED_SHOPS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter & Search
  const [shopFilter, setShopFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'admin' | 'owner' | 'staff' | 'customer'>('all');
  const [accountSearch, setAccountSearch] = useState('');

  // Modals inside Admin App
  const [createAccountModalVisible, setCreateAccountModalVisible] = useState(false);
  const [newAccRole, setNewAccRole] = useState<'admin' | 'owner' | 'staff' | 'customer'>('staff');
  const [newAccName, setNewAccName] = useState('');
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccPhone, setNewAccPhone] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('Password123!');
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [roleEditProfile, setRoleEditProfile] = useState<Profile | null>(null);
  const [roleEditTarget, setRoleEditTarget] = useState<Profile['role']>('customer');

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

      if (!shopErr && dbShops) {
        setShops(dbShops as Shop[]);
      }

      // Load profiles
      const { data: dbProfiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
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

  // 3. Handle Admin Authentication (Sign In & Sign Up)
  const handleAuthSubmit = async () => {
    setAuthError(null);
    setAuthSuccess(null);

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('Please enter admin email and password.');
      return;
    }

    setLoggingIn(true);
    try {
      if (isSignUp) {
        if (!signUpFullName.trim()) {
          setAuthError('Please enter your full name.');
          setLoggingIn(false);
          return;
        }

        if (loginPassword.length < 6) {
          setAuthError('Password must be at least 6 characters.');
          setLoggingIn(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: loginEmail.trim(),
          password: loginPassword,
          options: {
            data: {
              full_name: signUpFullName.trim(),
              phone: signUpPhone.trim() || null,
              role: 'admin'
            }
          }
        });

        if (error) throw error;

        const userId = data.user?.id || data.session?.user?.id;
        if (userId) {
          await (supabase.from('profiles') as any).upsert({
            id: userId,
            role: 'admin',
            full_name: signUpFullName.trim(),
            phone: signUpPhone.trim() || null,
            updated_at: new Date().toISOString()
          });

          if (!data.session?.user) {
            const { data: signInRes } = await supabase.auth.signInWithPassword({
              email: loginEmail.trim(),
              password: loginPassword
            });
            if (signInRes?.user) {
              setAdminUser({
                id: signInRes.user.id,
                email: signInRes.user.email || '',
                name: signUpFullName.trim()
              });
              return;
            }
          } else {
            setAdminUser({
              id: userId,
              email: loginEmail.trim(),
              name: signUpFullName.trim()
            });
            return;
          }

          setIsSignUp(false);
          setAuthSuccess('Admin account created! Please sign in with your credentials.');
        }
      } else {
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
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setAuthError(msg);
    } finally {
      setLoggingIn(false);
    }
  };

  const fillSeedAdmin = () => {
    setLoginEmail('admin@quickcut.com');
    setLoginPassword('Password123!');
    setIsSignUp(false);
    setAuthError(null);
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

  // 5. Account Provisioning Action (Inside Admin App)
  const handleProvisionAccount = async () => {
    if (!newAccName.trim() || !newAccEmail.trim() || !newAccPassword.trim()) {
      Alert.alert('Required Fields', 'Please fill in Name, Email, and Password.');
      return;
    }

    setCreatingAccount(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newAccEmail.trim(),
        password: newAccPassword,
        options: {
          data: {
            full_name: newAccName.trim(),
            phone: newAccPhone.trim() || null,
            role: newAccRole
          }
        }
      });

      if (error) throw error;

      const createdUserId = data.user?.id || data.session?.user?.id;
      if (createdUserId) {
        const newProfile: Profile = {
          id: createdUserId,
          role: newAccRole,
          full_name: newAccName.trim(),
          phone: newAccPhone.trim() || null,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await (supabase.from('profiles') as any).upsert(newProfile);

        await (supabase.from('audit_logs') as any).insert({
          user_id: adminUser?.id,
          action: 'ACCOUNT_PROVISIONED_BY_ADMIN',
          entity_type: 'profiles',
          entity_id: createdUserId,
          payload: {
            user_name: newAccName.trim(),
            email: newAccEmail.trim(),
            role: newAccRole
          }
        });

        setProfiles((prev) => [newProfile, ...prev]);
        setCreateAccountModalVisible(false);
        setNewAccName('');
        setNewAccEmail('');
        setNewAccPhone('');
        setNewAccPassword('Password123!');
        Alert.alert('Account Created', `Successfully provisioned ${newAccRole.toUpperCase()} account for "${newAccName.trim()}".`);
      }
    } catch (err: any) {
      Alert.alert('Provisioning Error', err.message || 'Failed to create account.');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSaveUserRole = async () => {
    if (!roleEditProfile) return;
    try {
      const { error } = await (supabase.from('profiles') as any)
        .update({ role: roleEditTarget, updated_at: new Date().toISOString() })
        .eq('id', roleEditProfile.id);

      if (error) throw error;

      await (supabase.from('audit_logs') as any).insert({
        user_id: adminUser?.id,
        action: 'PROFILE_ROLE_UPDATED',
        entity_type: 'profiles',
        entity_id: roleEditProfile.id,
        payload: {
          user_name: roleEditProfile.full_name,
          new_role: roleEditTarget
        }
      });

      setProfiles((prev) =>
        prev.map((p) => (p.id === roleEditProfile.id ? { ...p, role: roleEditTarget } : p))
      );
      setRoleEditProfile(null);
      Alert.alert('Role Updated', `User role changed to ${roleEditTarget.toUpperCase()}.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update role.');
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

  // ==========================================
  // METRICS & COUNTERS (Explicitly computed)
  // ==========================================
  const totalShopsCount = shops.length;
  const pendingCount = shops.filter((s) => s.status === 'pending').length;
  const approvedCount = shops.filter((s) => s.status === 'approved').length;
  const suspendedCount = shops.filter((s) => s.status === 'suspended').length;

  // Breakdown of user counts by role
  const customerCount = profiles.filter((p) => p.role === 'customer').length;
  const ownerCount = profiles.filter((p) => p.role === 'owner').length;
  const staffCount = profiles.filter((p) => p.role === 'staff').length;
  const adminCount = profiles.filter((p) => p.role === 'admin').length;

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

  // Filtered accounts
  const filteredProfiles = profiles.filter((p) => {
    const matchesRole = accountFilter === 'all' || p.role === accountFilter;
    const matchesSearch =
      p.full_name.toLowerCase().includes(accountSearch.toLowerCase()) ||
      (p.phone && p.phone.toLowerCase().includes(accountSearch.toLowerCase()));
    return matchesRole && matchesSearch;
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
  // RENDER: Admin Auth Screen (Sign In & Sign Up)
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
            {/* Header with Mode Toggle */}
            <View style={styles.modeToggleRow}>
              <TouchableOpacity
                style={[styles.modeTab, !isSignUp && styles.modeTabActive]}
                onPress={() => {
                  setIsSignUp(false);
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
              >
                <Text style={[styles.modeTabText, !isSignUp && styles.modeTabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, isSignUp && styles.modeTabActive]}
                onPress={() => {
                  setIsSignUp(true);
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
              >
                <Text style={[styles.modeTabText, isSignUp && styles.modeTabTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardHeader}>
              {isSignUp ? 'Create Administrator Account' : 'Administrator Sign In'}
            </Text>
            <Text style={styles.cardInfo}>
              {isSignUp
                ? 'Register a new super administrator account with platform-wide oversight and barbershop moderation privileges.'
                : 'Sign in with your platform super-admin credentials to inspect live queues, approve barbershops, and audit system events.'}
            </Text>

            {authError && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorAlertText}>{authError}</Text>
              </View>
            )}

            {authSuccess && (
              <View style={styles.successAlert}>
                <Text style={styles.successAlertText}>{authSuccess}</Text>
              </View>
            )}

            {/* Sign Up Specific Fields */}
            {isSignUp && (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Full Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Sarah Connor (Admin)"
                    placeholderTextColor="#64748B"
                    value={signUpFullName}
                    onChangeText={setSignUpFullName}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="+91 99000 11111"
                    placeholderTextColor="#64748B"
                    value={signUpPhone}
                    onChangeText={setSignUpPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
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

            {isSignUp && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Admin Security Passcode</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="QUICKCUT2026"
                  placeholderTextColor="#64748B"
                  value={adminPasscode}
                  onChangeText={setAdminPasscode}
                  autoCapitalize="characters"
                />
                <Text style={styles.fieldHint}>Master authorization key: QUICKCUT2026</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleAuthSubmit}
              disabled={loggingIn}
            >
              {loggingIn ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isSignUp ? 'Create Admin Account' : 'Access Admin Station'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.seedButton} onPress={fillSeedAdmin}>
              <Text style={styles.seedButtonText}>⚡ Autofill Seed Admin (admin@quickcut.com)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 16, alignItems: 'center' }}
              onPress={() => {
                setIsSignUp(!isSignUp);
                setAuthError(null);
                setAuthSuccess(null);
              }}
            >
              <Text style={styles.toggleAuthText}>
                {isSignUp
                  ? 'Already have an administrator account? Sign In'
                  : 'Need to create an administrator account? Sign Up'}
              </Text>
            </TouchableOpacity>
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

      {/* PROMINENT LIVE PLATFORM COUNTERS BAR */}
      <View style={styles.pulseBar}>
        <View style={styles.pulseItem}>
          <Text style={styles.pulseNumber}>{totalShopsCount}</Text>
          <Text style={styles.pulseLabel}>🏬 Shops</Text>
        </View>

        <View style={styles.pulseDivider} />

        <View style={styles.pulseItem}>
          <Text style={[styles.pulseNumber, { color: '#10B981' }]}>{customerCount}</Text>
          <Text style={styles.pulseLabel}>👥 Customers</Text>
        </View>

        <View style={styles.pulseDivider} />

        <View style={styles.pulseItem}>
          <Text style={[styles.pulseNumber, { color: '#60A5FA' }]}>{ownerCount}</Text>
          <Text style={styles.pulseLabel}>🏪 Owners</Text>
        </View>

        <View style={styles.pulseDivider} />

        <View style={styles.pulseItem}>
          <Text style={[styles.pulseNumber, { color: '#F59E0B' }]}>{activeQueuesCount}</Text>
          <Text style={styles.pulseLabel}>💈 In Queue</Text>
        </View>
      </View>

      {/* Navigation Sub-Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'shops' && styles.tabItemActive]}
          onPress={() => setActiveTab('shops')}
        >
          <Text style={[styles.tabItemText, activeTab === 'shops' && styles.tabItemTextActive]}>
            💈 Shops ({totalShopsCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'accounts' && styles.tabItemActive]}
          onPress={() => setActiveTab('accounts')}
        >
          <Text style={[styles.tabItemText, activeTab === 'accounts' && styles.tabItemTextActive]}>
            👥 Customers ({customerCount})
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
            🔍 Audit
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
            {/* Stat Banner for Shops */}
            <View style={styles.statBanner}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.statBannerTitle}>🏬 Total Barbershops: {totalShopsCount}</Text>
                <View style={styles.statBannerBadge}>
                  <Text style={styles.statBannerBadgeText}>{approvedCount} ACTIVE</Text>
                </View>
              </View>
              <Text style={styles.statBannerSubtitle}>
                {approvedCount} Live & Approved • {pendingCount} Pending Approval • {suspendedCount} Suspended
              </Text>
            </View>

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
                    {filter === 'all' ? ` (${totalShopsCount})` : ''}
                    {filter === 'pending' ? ` (${pendingCount})` : ''}
                    {filter === 'approved' ? ` (${approvedCount})` : ''}
                    {filter === 'suspended' ? ` (${suspendedCount})` : ''}
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
        {/* TAB 2: ACCOUNTS & CUSTOMER DIRECTORY    */}
        {/* ======================================= */}
        {activeTab === 'accounts' && (
          <View>
            {/* Stat Banner for Customers & Users */}
            <View style={styles.statBanner}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.statBannerTitle}>👥 Total Customers: {customerCount}</Text>
                <View style={[styles.statBannerBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
                  <Text style={[styles.statBannerBadgeText, { color: '#10B981' }]}>{profiles.length} TOTAL USERS</Text>
                </View>
              </View>
              <Text style={styles.statBannerSubtitle}>
                {customerCount} Customers • {ownerCount} Shop Owners • {staffCount} Staff Barbers • {adminCount} Admins
              </Text>
            </View>

            {/* Header with "+ Create Account" Button */}
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeading}>User Directory</Text>
                <Text style={styles.sectionSubtitle}>
                  View and manage customers, owners, and staff.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.createAccountBtn}
                onPress={() => setCreateAccountModalVisible(true)}
              >
                <Text style={styles.createAccountBtnText}>+ Create Account</Text>
              </TouchableOpacity>
            </View>

            {/* Search and Filters */}
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search accounts by name or phone..."
                placeholderTextColor="#64748B"
                value={accountSearch}
                onChangeText={setAccountSearch}
              />
            </View>

            <View style={styles.filterRow}>
              {(['all', 'customer', 'owner', 'staff', 'admin'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterChip, accountFilter === r && styles.filterChipActive]}
                  onPress={() => setAccountFilter(r)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      accountFilter === r && styles.filterChipTextActive
                    ]}
                  >
                    {r.toUpperCase()}
                    {r === 'all' ? ` (${profiles.length})` : ''}
                    {r === 'customer' ? ` (${customerCount})` : ''}
                    {r === 'owner' ? ` (${ownerCount})` : ''}
                    {r === 'staff' ? ` (${staffCount})` : ''}
                    {r === 'admin' ? ` (${adminCount})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredProfiles.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No Accounts Found</Text>
                <Text style={styles.emptySubtitle}>
                  No user profiles match the selected role filter or search query.
                </Text>
              </View>
            ) : (
              filteredProfiles.map((p) => (
                <View key={p.id} style={styles.accountCard}>
                  <View style={styles.accountCardTop}>
                    <View
                      style={[
                        styles.avatarCircle,
                        p.role === 'admin' && { borderColor: '#F59E0B' },
                        p.role === 'owner' && { borderColor: '#3B82F6' },
                        p.role === 'staff' && { borderColor: '#A855F7' },
                        p.role === 'customer' && { borderColor: '#10B981' }
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.accountName}>
                        {p.full_name}{' '}
                        {p.id === adminUser.id && (
                          <Text style={{ color: '#F59E0B', fontSize: 11 }}>(You)</Text>
                        )}
                      </Text>
                      <Text style={styles.accountPhone}>📞 {p.phone || 'No phone'}</Text>
                      <Text style={styles.accountIdText}>ID: {p.id.slice(0, 14)}...</Text>
                    </View>

                    <View style={styles.roleCol}>
                      <View
                        style={[
                          styles.roleBadge,
                          p.role === 'admin' && styles.roleBadgeAdmin,
                          p.role === 'owner' && styles.roleBadgeOwner,
                          p.role === 'staff' && styles.roleBadgeStaff,
                          p.role === 'customer' && styles.roleBadgeCustomer
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            p.role === 'admin' && { color: '#F59E0B' },
                            p.role === 'owner' && { color: '#60A5FA' },
                            p.role === 'staff' && { color: '#C084FC' },
                            p.role === 'customer' && { color: '#10B981' }
                          ]}
                        >
                          {p.role.toUpperCase()}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.changeRoleBtn}
                        onPress={() => {
                          setRoleEditProfile(p);
                          setRoleEditTarget(p.role);
                        }}
                      >
                        <Text style={styles.changeRoleBtnText}>Edit Role</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 3: LIVE METRICS & POLICY            */}
        {/* ======================================= */}
        {activeTab === 'metrics' && (
          <View>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{totalShopsCount}</Text>
                <Text style={styles.metricLabel}>Total Barbershops</Text>
                <Text style={styles.metricSub}>{approvedCount} Approved • {pendingCount} Pending</Text>
              </View>

              <View style={[styles.metricCard, { borderColor: '#065F46' }]}>
                <Text style={[styles.metricValue, { color: '#10B981' }]}>{customerCount}</Text>
                <Text style={styles.metricLabel}>Total Customers</Text>
                <Text style={styles.metricSub}>Registered customer profiles</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={[styles.metricValue, { color: '#60A5FA' }]}>{ownerCount}</Text>
                <Text style={styles.metricLabel}>Shop Owners</Text>
                <Text style={styles.metricSub}>Registered salon owners</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={[styles.metricValue, { color: '#C084FC' }]}>{staffCount}</Text>
                <Text style={styles.metricLabel}>Staff Barbers</Text>
                <Text style={styles.metricSub}>Barbers & stylists</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{activeQueuesCount}</Text>
                <Text style={styles.metricLabel}>In Queue Right Now</Text>
                <Text style={styles.metricSub}>Customers waiting in chairs</Text>
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
        {/* TAB 4: AUDIT TRAIL                      */}
        {/* ======================================= */}
        {activeTab === 'audit' && (
          <View>
            <Text style={styles.sectionHeading}>Tamper-Evident Audit Stream</Text>
            <Text style={styles.sectionSubtitle}>
              Immutable log of critical platform mutations, account creations, and shop status changes.
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
        {/* TAB 5: SUPPORT & DISPUTES               */}
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

      {/* ======================================= */}
      {/* MODAL: PROVISION NEW ACCOUNT            */}
      {/* ======================================= */}
      <Modal visible={createAccountModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Provision New Account</Text>
            <Text style={styles.modalSubtitle}>
              Create a new user account and assign its platform security role.
            </Text>

            <Text style={styles.formLabel}>Select Account Role</Text>
            <View style={styles.roleSelectRow}>
              {(['staff', 'owner', 'admin', 'customer'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleSelectBtn, newAccRole === r && styles.roleSelectBtnActive]}
                  onPress={() => setNewAccRole(r)}
                >
                  <Text
                    style={[
                      styles.roleSelectText,
                      newAccRole === r && styles.roleSelectTextActive
                    ]}
                  >
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Full Name</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Rohan Verma"
                placeholderTextColor="#64748B"
                value={newAccName}
                onChangeText={setNewAccName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email Address</Text>
              <TextInput
                style={styles.formInput}
                placeholder="rohan@example.com"
                placeholderTextColor="#64748B"
                value={newAccEmail}
                onChangeText={setNewAccEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone (Optional)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="+91 98765 43210"
                placeholderTextColor="#64748B"
                value={newAccPhone}
                onChangeText={setNewAccPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Initial Password</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Password123!"
                placeholderTextColor="#64748B"
                value={newAccPassword}
                onChangeText={setNewAccPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setCreateAccountModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={handleProvisionAccount}
                disabled={creatingAccount}
              >
                {creatingAccount ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.modalSaveText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================= */}
      {/* MODAL: EDIT USER ROLE                   */}
      {/* ======================================= */}
      <Modal visible={!!roleEditProfile} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change User Role</Text>
            <Text style={styles.modalSubtitle}>
              Reassign platform permissions for &ldquo;{roleEditProfile?.full_name}&rdquo;.
            </Text>

            <View style={styles.roleSelectRow}>
              {(['customer', 'staff', 'owner', 'admin'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleSelectBtn, roleEditTarget === r && styles.roleSelectBtnActive]}
                  onPress={() => setRoleEditTarget(r)}
                >
                  <Text
                    style={[
                      styles.roleSelectText,
                      roleEditTarget === r && styles.roleSelectTextActive
                    ]}
                  >
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setRoleEditProfile(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveUserRole}>
                <Text style={styles.modalSaveText}>Update Role</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginTop: 16,
    marginBottom: 20
  },
  crownCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  crownEmoji: {
    fontSize: 32
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  authSubtitle: {
    fontSize: 13,
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
  modeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8
  },
  modeTabActive: {
    backgroundColor: '#F59E0B'
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8'
  },
  modeTabTextActive: {
    color: '#0F172A'
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
    marginBottom: 16
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
  successAlert: {
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#10B981',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  successAlertText: {
    color: '#A7F3D0',
    fontSize: 13
  },
  formGroup: {
    marginBottom: 14
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6
  },
  formInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#334155'
  },
  fieldHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4
  },
  submitBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8
  },
  submitBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15
  },
  seedButton: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  seedButtonText: {
    color: '#F59E0B',
    fontWeight: '600',
    fontSize: 12
  },
  toggleAuthText: {
    color: '#94A3B8',
    fontSize: 12
  },

  // Main Dashboard Styles
  mainContainer: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937'
  },
  navLeft: {
    flex: 1
  },
  navLogo: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F59E0B'
  },
  navUser: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  signOutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1F2937',
    borderRadius: 6
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600'
  },

  // Prominent Platform Pulse Bar
  pulseBar: {
    flexDirection: 'row',
    backgroundColor: '#0A0F1D',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  pulseItem: {
    alignItems: 'center'
  },
  pulseNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F59E0B'
  },
  pulseLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600'
  },
  pulseDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1E293B'
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
    paddingVertical: 11,
    alignItems: 'center'
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#F59E0B'
  },
  tabItemText: {
    fontSize: 11,
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

  // Stat Banner
  statBanner: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  statBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  statBannerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16
  },
  statBannerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B'
  },
  statBannerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B'
  },

  // Section Header Row
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  createAccountBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8
  },
  createAccountBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 12
  },

  // Search & Filter
  searchBox: {
    marginBottom: 12
  },
  searchInput: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 6
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  filterChipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B'
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8'
  },
  filterChipTextActive: {
    color: '#0F172A'
  },

  // Account Card
  accountCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  accountCardTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  accountPhone: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  accountIdText: {
    fontSize: 10,
    color: '#64748B',
    fontFamily: Platform?.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2
  },
  roleCol: {
    alignItems: 'flex-end',
    gap: 6
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1E293B'
  },
  roleBadgeAdmin: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  roleBadgeOwner: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
  roleBadgeStaff: { backgroundColor: 'rgba(168, 85, 247, 0.15)' },
  roleBadgeCustomer: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800'
  },
  changeRoleBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155'
  },
  changeRoleBtnText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600'
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
    fontFamily: Platform?.OS === 'ios' ? 'Courier' : 'monospace',
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
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16
  },
  roleSelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  roleSelectBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  roleSelectBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B'
  },
  roleSelectText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8'
  },
  roleSelectTextActive: {
    color: '#0F172A'
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 14
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  modalCancelText: {
    color: '#94A3B8',
    fontWeight: '600'
  },
  modalSave: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8
  },
  modalSaveText: {
    color: '#0F172A',
    fontWeight: '700'
  }
});
