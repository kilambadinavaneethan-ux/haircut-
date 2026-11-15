import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Service,
  QueueEntryWithDetails,
  getSupabaseClient
} from '@quickcut/shared';

// Seed shop for Alex Rivera (only used if logging in as demo seed owner and offline)
const SEED_ALEX_SHOP: Shop = {
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
};

export default function OwnerMobileApp() {
  const [ownerUser, setOwnerUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth form state (Supports Sign In & Sign Up with Shop Creation)
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPhone, setAuthPhone] = useState('');

  // New Shop Details (for sign-up onboarding)
  const [signupShopName, setSignupShopName] = useState('');
  const [signupShopAddress, setSignupShopAddress] = useState('');
  const [signupShopPhone, setSignupShopPhone] = useState('');
  const [signupOpeningTime, setSignupOpeningTime] = useState('09:00:00');
  const [signupClosingTime, setSignupClosingTime] = useState('21:00:00');

  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Isolated Shop State (Only shops owned by this user)
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string>('');
  const [services, setServices] = useState<Service[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntryWithDetails[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'earnings' | 'services'>('queue');
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Standalone Shop Registration Modal
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [regShopName, setRegShopName] = useState('');
  const [regShopAddress, setRegShopAddress] = useState('');
  const [regShopPhone, setRegShopPhone] = useState('');
  const [registeringShop, setRegisteringShop] = useState(false);

  // Service Creation Modal
  const [addServiceModalVisible, setAddServiceModalVisible] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('250');
  const [newServiceDuration, setNewServiceDuration] = useState('25');

  const supabase = getSupabaseClient();
  const activeShop = shops.find((s) => s.id === activeShopId) || shops[0] || null;

  // 1. Initial Session Check
  useEffect(() => {
    checkOwnerSession();
  }, []);

  const checkOwnerSession = async () => {
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
        const name = (profile as any)?.full_name || user.email?.split('@')[0] || 'Shop Owner';

        if (role === 'owner' || user.email?.includes('owner')) {
          setOwnerUser({ id: user.id, email: user.email || '', name });
        }
      }
    } catch {
      // offline fallback
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Load Owner's Separate Shops (owner_id = ownerUser.id)
  const loadOwnerData = useCallback(async () => {
    if (!ownerUser) return;
    setLoadingData(true);
    try {
      // Load shops belonging strictly to this owner
      const { data: dbShops, error: shopsErr } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', ownerUser.id)
        .order('created_at', { ascending: false });

      const loadedShops = (dbShops as unknown as Shop[]) || [];

      // If Alex Rivera seed demo and offline, provide seed shop
      if (loadedShops.length === 0 && ownerUser.email === 'owner.alex@quickcut.com') {
        setShops([SEED_ALEX_SHOP]);
        setActiveShopId(SEED_ALEX_SHOP.id);
        return;
      }

      setShops(loadedShops);

      const targetId = activeShopId && loadedShops.some((s) => s.id === activeShopId)
        ? activeShopId
        : loadedShops[0]?.id || '';

      setActiveShopId(targetId);

      if (targetId) {
        // Load services for this shop
        const { data: dbServices } = await supabase
          .from('services')
          .select('*')
          .eq('shop_id', targetId)
          .order('name');

        if (dbServices) setServices(dbServices as Service[]);

        // Load queue entries for this shop
        const { data: dbQueue } = await supabase
          .from('queue_entries')
          .select('*, service:services(*), customer:profiles!queue_entries_customer_id_fkey(*)')
          .eq('shop_id', targetId)
          .order('created_at', { ascending: false });

        if (dbQueue) setQueueEntries(dbQueue as QueueEntryWithDetails[]);
      } else {
        setServices([]);
        setQueueEntries([]);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, [ownerUser, activeShopId, supabase]);

  useEffect(() => {
    if (ownerUser) {
      loadOwnerData();
    }
  }, [ownerUser, loadOwnerData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOwnerData();
  };

  // 3. Auth Submission (Sign In & Sign Up with Shop Creation)
  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please fill in both email and password.');
      return;
    }

    setLoggingIn(true);
    setAuthError(null);
    try {
      if (isSignUp) {
        // Validate Owner & Shop details
        if (!authFullName.trim()) {
          setAuthError('Please enter your full name.');
          setLoggingIn(false);
          return;
        }

        if (!signupShopName.trim()) {
          setAuthError('Please enter your barbershop name.');
          setLoggingIn(false);
          return;
        }

        if (!signupShopAddress.trim()) {
          setAuthError('Please enter your barbershop address.');
          setLoggingIn(false);
          return;
        }

        if (authPassword.length < 6) {
          setAuthError('Password must be at least 6 characters.');
          setLoggingIn(false);
          return;
        }

        // 1. Register Owner via Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: {
              full_name: authFullName.trim(),
              phone: authPhone.trim() || null,
              role: 'owner'
            }
          }
        });

        if (error) throw error;

        const userId = data.user?.id || data.session?.user?.id;
        if (!userId) {
          throw new Error('Registration failed. Please try again.');
        }

        // 2. Guarantee Owner Profile row
        await (supabase.from('profiles') as any).upsert({
          id: userId,
          role: 'owner',
          full_name: authFullName.trim(),
          phone: authPhone.trim() || null,
          updated_at: new Date().toISOString()
        });

        // 3. Create Separate Shop for this Owner
        const { data: createdShop, error: shopErr } = await (supabase.from('shops') as any).insert({
          owner_id: userId,
          name: signupShopName.trim(),
          address: signupShopAddress.trim(),
          phone: signupShopPhone.trim() || authPhone.trim() || null,
          status: 'pending', // Pending admin approval
          is_queue_paused: false,
          opening_time: signupOpeningTime || '09:00:00',
          closing_time: signupClosingTime || '21:00:00'
        }).select().single();

        if (shopErr) throw shopErr;

        // 4. Seed 3 default starter services for this shop
        if (createdShop?.id) {
          try {
            await (supabase.from('services') as any).insert([
              { shop_id: createdShop.id, name: 'Classic Haircut', price: 250, avg_minutes: 25, is_active: true },
              { shop_id: createdShop.id, name: 'Beard Trim & Shape', price: 150, avg_minutes: 15, is_active: true },
              { shop_id: createdShop.id, name: 'Hair & Beard Combo', price: 350, avg_minutes: 35, is_active: true }
            ]);
          } catch {
            // Non-critical if services fail
          }
        }

        // 5. Establish Session
        const { data: signInRes } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword
        });

        const activeUserId = signInRes?.user?.id || userId;
        setOwnerUser({
          id: activeUserId,
          email: authEmail.trim(),
          name: authFullName.trim()
        });

        if (createdShop) {
          setShops([createdShop as Shop]);
          setActiveShopId(createdShop.id);
        }

        Alert.alert(
          'Account & Shop Created!',
          `Welcome, ${authFullName.trim()}! Your shop "${signupShopName.trim()}" has been registered and submitted for admin approval.`
        );
      } else {
        // Sign In Existing Owner
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword
        });

        if (error) throw error;
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          const name = (profile as any)?.full_name || 'Shop Owner';
          setOwnerUser({ id: data.user.id, email: data.user.email || '', name });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setAuthError(msg);
    } finally {
      setLoggingIn(false);
    }
  };

  const fillSeedOwner = () => {
    setAuthEmail('owner.alex@quickcut.com');
    setAuthPassword('Password123!');
    setIsSignUp(false);
    setAuthError(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setOwnerUser(null);
    setShops([]);
    setActiveShopId('');
  };

  // 4. Shop Management Actions
  const handleToggleQueuePause = async () => {
    if (!activeShop) return;
    const nextState = !activeShop.is_queue_paused;
    try {
      const { error } = await (supabase.from('shops') as any)
        .update({ is_queue_paused: nextState, updated_at: new Date().toISOString() })
        .eq('id', activeShop.id);

      if (error) throw error;

      setShops((prev) =>
        prev.map((s) => (s.id === activeShop.id ? { ...s, is_queue_paused: nextState } : s))
      );
      Alert.alert(
        nextState ? 'Queue Paused' : 'Queue Resumed',
        `Live customer queue for "${activeShop.name}" is now ${nextState ? 'paused' : 'open'}.`
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to toggle queue.');
    }
  };

  // Register additional shop for this owner
  const handleRegisterAdditionalShop = async () => {
    if (!regShopName.trim() || !regShopAddress.trim()) {
      Alert.alert('Required Fields', 'Please provide both shop name and address.');
      return;
    }

    setRegisteringShop(true);
    try {
      const { data, error } = await (supabase.from('shops') as any).insert({
        owner_id: ownerUser?.id,
        name: regShopName.trim(),
        address: regShopAddress.trim(),
        phone: regShopPhone.trim() || null,
        status: 'pending',
        is_queue_paused: false,
        opening_time: '09:00:00',
        closing_time: '21:00:00'
      }).select().single();

      if (error) throw error;

      if (data) {
        // Add starter services
        await (supabase.from('services') as any).insert([
          { shop_id: data.id, name: 'Classic Haircut', price: 250, avg_minutes: 25, is_active: true },
          { shop_id: data.id, name: 'Beard Trim & Shape', price: 150, avg_minutes: 15, is_active: true }
        ]);

        setShops((prev) => [data as Shop, ...prev]);
        setActiveShopId(data.id);
      }
      setRegisterModalVisible(false);
      setRegShopName('');
      setRegShopAddress('');
      setRegShopPhone('');
      Alert.alert('Shop Submitted', `"${regShopName.trim()}" has been submitted for admin approval!`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to register shop.');
    } finally {
      setRegisteringShop(false);
    }
  };

  const handleAddService = async () => {
    if (!activeShop) return;
    if (!newServiceName.trim()) {
      Alert.alert('Error', 'Please enter service name.');
      return;
    }

    const price = parseFloat(newServicePrice) || 200;
    const duration = parseInt(newServiceDuration, 10) || 20;

    try {
      const { data, error } = await (supabase.from('services') as any).insert({
        shop_id: activeShop.id,
        name: newServiceName.trim(),
        price: price,
        avg_minutes: duration,
        is_active: true
      }).select().single();

      if (error) throw error;

      if (data) {
        setServices((prev) => [...prev, data as Service]);
      }
      setAddServiceModalVisible(false);
      setNewServiceName('');
      setNewServicePrice('250');
      setNewServiceDuration('25');
      Alert.alert('Service Added', `"${newServiceName.trim()}" is now available in your shop.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add service.');
    }
  };

  // 5. Calculations
  const waitingEntries = useMemo(
    () => queueEntries.filter((q) => q.status === 'waiting' || q.status === 'in_service'),
    [queueEntries]
  );

  const completedEntries = useMemo(
    () => queueEntries.filter((q) => q.status === 'completed'),
    [queueEntries]
  );

  const totalEarnings = useMemo(() => {
    return completedEntries.reduce((sum, q) => {
      const price = q.service?.price || 200;
      return sum + Number(price);
    }, 0);
  }, [completedEntries]);

  // ==========================================
  // RENDER: Loading State
  // ==========================================
  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading QuickCut Owner App...</Text>
      </View>
    );
  }

  // ==========================================
  // RENDER: Owner Auth Screen (Separate Account & Separate Shop)
  // ==========================================
  if (!ownerUser) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authScroll}>
          <View style={styles.authHeader}>
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerEmoji}>🏪</Text>
            </View>
            <Text style={styles.authTitle}>QuickCut Shop Owner</Text>
            <Text style={styles.authSubtitle}>Salon Management & Revenue Operations</Text>
          </View>

          <View style={styles.authCard}>
            {/* Mode Switcher */}
            <View style={styles.modeToggleRow}>
              <TouchableOpacity
                style={[styles.modeTab, !isSignUp && styles.modeTabActive]}
                onPress={() => {
                  setIsSignUp(false);
                  setAuthError(null);
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
                }}
              >
                <Text style={[styles.modeTabText, isSignUp && styles.modeTabTextActive]}>
                  Create Account & Shop
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardHeader}>
              {isSignUp ? 'Register Owner & Barbershop' : 'Shop Owner Sign In'}
            </Text>
            <Text style={styles.cardInfo}>
              {isSignUp
                ? 'Create your dedicated owner account and list your separate barbershop to start managing queues.'
                : 'Sign in to monitor your live customer queue, manage haircut pricing, and view daily earnings.'}
            </Text>

            {authError && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorAlertText}>{authError}</Text>
              </View>
            )}

            {/* SECTION 1: OWNER CREDENTIALS */}
            <Text style={styles.sectionDivider}>1. OWNER ACCOUNT DETAILS</Text>

            {isSignUp && (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Owner Full Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Vikram Malhotra"
                    placeholderTextColor="#64748B"
                    value={authFullName}
                    onChangeText={setAuthFullName}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="+91 98765 12345"
                    placeholderTextColor="#64748B"
                    value={authPhone}
                    onChangeText={setAuthPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Owner Email</Text>
              <TextInput
                style={styles.formInput}
                placeholder="owner@quickcut.com"
                placeholderTextColor="#64748B"
                value={authEmail}
                onChangeText={setAuthEmail}
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
                value={authPassword}
                onChangeText={setAuthPassword}
                secureTextEntry
              />
            </View>

            {/* SECTION 2: SEPARATE SHOP DETAILS (SIGNUP ONLY) */}
            {isSignUp && (
              <>
                <Text style={[styles.sectionDivider, { marginTop: 14 }]}>
                  2. YOUR SEPARATE BARBERSHOP
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Barbershop Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Malhotra Fades & Shaves"
                    placeholderTextColor="#64748B"
                    value={signupShopName}
                    onChangeText={setSignupShopName}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Shop Address</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Shop 4, 100ft Road, Indiranagar"
                    placeholderTextColor="#64748B"
                    value={signupShopAddress}
                    onChangeText={setSignupShopAddress}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Shop Contact Phone (Optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="+91 80 4111 2222"
                    placeholderTextColor="#64748B"
                    value={signupShopPhone}
                    onChangeText={setSignupShopPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleAuthSubmit}
              disabled={loggingIn}
            >
              {loggingIn ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isSignUp ? 'Create Account & Register Shop' : 'Sign In as Owner'}
                </Text>
              )}
            </TouchableOpacity>

            {!isSignUp && (
              <TouchableOpacity style={styles.seedButton} onPress={fillSeedOwner}>
                <Text style={styles.seedButtonText}>⚡ Autofill Demo Owner (Alex Rivera)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ marginTop: 16, alignItems: 'center' }}
              onPress={() => {
                setIsSignUp(!isSignUp);
                setAuthError(null);
              }}
            >
              <Text style={styles.toggleAuthText}>
                {isSignUp
                  ? 'Already have an owner account? Sign In'
                  : 'New shop owner? Create Account & Shop'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // RENDER: Case Where Owner Has No Shop Yet
  // ==========================================
  if (shops.length === 0 || !activeShop) {
    return (
      <SafeAreaView style={styles.mainContainer}>
        <StatusBar style="light" />
        <View style={styles.navbar}>
          <Text style={styles.navLogo}>🏪 QuickCut Owner</Text>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.noShopContainer}>
          <View style={styles.noShopCard}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>💈</Text>
            <Text style={styles.noShopTitle}>Welcome, {ownerUser.name}!</Text>
            <Text style={styles.noShopSubtitle}>
              You don&apos;t have a barbershop registered yet. Register your barbershop below to get your separate live queue and pricing menu.
            </Text>

            <View style={{ width: '100%', marginTop: 20 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Barbershop Name</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Royal Cuts Lounge"
                  placeholderTextColor="#64748B"
                  value={regShopName}
                  onChangeText={setRegShopName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Shop Address</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 15 CMH Road, Bengaluru"
                  placeholderTextColor="#64748B"
                  value={regShopAddress}
                  onChangeText={setRegShopAddress}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Shop Contact Phone</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#64748B"
                  value={regShopPhone}
                  onChangeText={setRegShopPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleRegisterAdditionalShop}
                disabled={registeringShop}
              >
                {registeringShop ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Register My Barbershop</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // RENDER: Main Owner Dashboard For Active Shop
  // ==========================================
  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.navbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.navLogo}>🏪 QuickCut Owner</Text>
          <Text style={styles.navUser}>
            {ownerUser.name} ({ownerUser.email})
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={styles.addShopBtn}
            onPress={() => setRegisterModalVisible(true)}
          >
            <Text style={styles.addShopBtnText}>+ Shop</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Multi-Shop Selector Bar (If owner has multiple shops) */}
      {shops.length > 1 && (
        <ScrollView horizontal style={styles.shopSelectorBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {shops.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.shopSelectChip,
                s.id === activeShopId && styles.shopSelectChipActive
              ]}
              onPress={() => setActiveShopId(s.id)}
            >
              <Text
                style={[
                  styles.shopSelectText,
                  s.id === activeShopId && styles.shopSelectTextActive
                ]}
              >
                💈 {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Active Shop Info & Status Bar */}
      <View style={styles.shopBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shopBarName}>{activeShop.name}</Text>
          <Text style={styles.shopBarAddress} numberOfLines={1}>📍 {activeShop.address}</Text>
        </View>

        <View style={styles.shopStatusCol}>
          <View
            style={[
              styles.statusChip,
              activeShop.status === 'approved' && styles.statusApproved,
              activeShop.status === 'pending' && styles.statusPending,
              activeShop.status === 'suspended' && styles.statusSuspended
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                activeShop.status === 'approved' && { color: '#10B981' },
                activeShop.status === 'pending' && { color: '#F59E0B' },
                activeShop.status === 'suspended' && { color: '#EF4444' }
              ]}
            >
              {activeShop.status === 'pending' ? 'PENDING APPROVAL' : activeShop.status.toUpperCase()}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.pauseBtn,
              activeShop.is_queue_paused && { backgroundColor: '#10B981' }
            ]}
            onPress={handleToggleQueuePause}
          >
            <Text style={styles.pauseBtnText}>
              {activeShop.is_queue_paused ? '▶️ Open Queue' : '⏸️ Pause Queue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'queue' && styles.tabItemActive]}
          onPress={() => setActiveTab('queue')}
        >
          <Text style={[styles.tabItemText, activeTab === 'queue' && styles.tabItemTextActive]}>
            💈 Live Queue ({waitingEntries.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'earnings' && styles.tabItemActive]}
          onPress={() => setActiveTab('earnings')}
        >
          <Text style={[styles.tabItemText, activeTab === 'earnings' && styles.tabItemTextActive]}>
            💰 Earnings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'services' && styles.tabItemActive]}
          onPress={() => setActiveTab('services')}
        >
          <Text style={[styles.tabItemText, activeTab === 'services' && styles.tabItemTextActive]}>
            ✂️ Services ({services.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
        }
      >
        {/* ======================================= */}
        {/* TAB 1: LIVE QUEUE                       */}
        {/* ======================================= */}
        {activeTab === 'queue' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Active Customer Queue</Text>
              <Text style={styles.sectionMeta}>{waitingEntries.length} waiting</Text>
            </View>

            {loadingData && !refreshing && (
              <ActivityIndicator color="#3B82F6" style={{ marginVertical: 16 }} />
            )}

            {waitingEntries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🛋️</Text>
                <Text style={styles.emptyTitle}>Queue Is Currently Clear</Text>
                <Text style={styles.emptySubtitle}>
                  Customers who join your queue via the Customer App will appear here in real-time.
                </Text>
              </View>
            ) : (
              waitingEntries.map((entry) => (
                <View key={entry.id} style={styles.queueCard}>
                  <View style={styles.queueCardTop}>
                    <View style={styles.queueNumBadge}>
                      <Text style={styles.queueNumText}>#{entry.queue_number}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.customerName}>
                        {entry.customer?.full_name || entry.guest_name || 'Walk-in Guest'}
                      </Text>
                      <Text style={styles.serviceName}>
                        ✂️ {entry.service?.name || 'Haircut Service'} (₹{entry.service?.price || 200})
                      </Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>{entry.status.toUpperCase()}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 2: EARNINGS & ZERO FEE POLICY       */}
        {/* ======================================= */}
        {activeTab === 'earnings' && (
          <View>
            <View style={styles.earningsGrid}>
              <View style={styles.earningsCard}>
                <Text style={styles.earningsValue}>₹{totalEarnings.toLocaleString()}</Text>
                <Text style={styles.earningsLabel}>Gross Revenue</Text>
                <Text style={styles.earningsSub}>100% Retained by Shop</Text>
              </View>

              <View style={[styles.earningsCard, { borderColor: '#10B981' }]}>
                <Text style={[styles.earningsValue, { color: '#10B981' }]}>₹0.00</Text>
                <Text style={styles.earningsLabel}>Platform Fee (Strict ₹0)</Text>
                <Text style={styles.earningsSub}>No commissions charged</Text>
              </View>

              <View style={styles.earningsCard}>
                <Text style={styles.earningsValue}>{completedEntries.length}</Text>
                <Text style={styles.earningsLabel}>Completed Services</Text>
                <Text style={styles.earningsSub}>Customers served</Text>
              </View>

              <View style={styles.earningsCard}>
                <Text style={styles.earningsValue}>{services.length}</Text>
                <Text style={styles.earningsLabel}>Menu Services</Text>
                <Text style={styles.earningsSub}>Haircuts & styling</Text>
              </View>
            </View>

            <View style={styles.guaranteeBox}>
              <Text style={styles.guaranteeTitle}>🛡️ QuickCut Zero-Fee Guarantee</Text>
              <Text style={styles.guaranteeDesc}>
                QuickCut operates on a strict ₹0 platform fee model. Every rupee paid by customers belongs 100% to your barbershop. There are no hidden fees, cuts, or percentages deducted.
              </Text>
            </View>
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 3: SERVICES                         */}
        {/* ======================================= */}
        {activeTab === 'services' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Shop Services & Pricing</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setAddServiceModalVisible(true)}
              >
                <Text style={styles.addBtnText}>+ Add Service</Text>
              </TouchableOpacity>
            </View>

            {services.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No Services Added</Text>
                <Text style={styles.emptySubtitle}>
                  Add services so customers can see prices and join your queue.
                </Text>
              </View>
            ) : (
              services.map((srv) => (
                <View key={srv.id} style={styles.serviceCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTitle}>{srv.name}</Text>
                    <Text style={styles.serviceMeta}>
                      ⏱️ {srv.avg_minutes} mins • 🟢 Active
                    </Text>
                  </View>
                  <Text style={styles.servicePrice}>₹{srv.price}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Service Modal */}
      <Modal visible={addServiceModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Haircut Service</Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Service Name</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Classic Fade & Beard Trim"
                placeholderTextColor="#64748B"
                value={newServiceName}
                onChangeText={setNewServiceName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Price (₹ INR)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="300"
                placeholderTextColor="#64748B"
                value={newServicePrice}
                onChangeText={setNewServicePrice}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Estimated Duration (Minutes)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="30"
                placeholderTextColor="#64748B"
                value={newServiceDuration}
                onChangeText={setNewServiceDuration}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setAddServiceModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleAddService}>
                <Text style={styles.modalSaveText}>Save Service</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Register Additional Shop Modal */}
      <Modal visible={registerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Register Another Barbershop</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>
              Add a second salon or branch location to your owner account.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Barbershop Name</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Crown & Blade - Indiranagar Branch"
                placeholderTextColor="#64748B"
                value={regShopName}
                onChangeText={setRegShopName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Shop Address</Text>
              <TextInput
                style={styles.formInput}
                placeholder="100ft Road, Indiranagar"
                placeholderTextColor="#64748B"
                value={regShopAddress}
                onChangeText={setRegShopAddress}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone Number</Text>
              <TextInput
                style={styles.formInput}
                placeholder="+91 80 4999 8888"
                placeholderTextColor="#64748B"
                value={regShopPhone}
                onChangeText={setRegShopPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setRegisterModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={handleRegisterAdditionalShop}
                disabled={registeringShop}
              >
                {registeringShop ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Submit Shop</Text>
                )}
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
  authContainer: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  authScroll: {
    padding: 20,
    justifyContent: 'center'
  },
  authHeader: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20
  },
  ownerBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  ownerEmoji: {
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
    marginBottom: 14
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8
  },
  modeTabActive: {
    backgroundColor: '#3B82F6'
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8'
  },
  modeTabTextActive: {
    color: '#FFFFFF'
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6
  },
  cardInfo: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
    marginBottom: 14
  },
  sectionDivider: {
    fontSize: 11,
    fontWeight: '800',
    color: '#60A5FA',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4
  },
  errorAlert: {
    backgroundColor: '#450A0A',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14
  },
  errorAlertText: {
    color: '#FCA5A5',
    fontSize: 12
  },
  formGroup: {
    marginBottom: 12
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 5
  },
  formInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#334155'
  },
  submitBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15
  },
  seedButton: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  seedButtonText: {
    color: '#60A5FA',
    fontWeight: '600',
    fontSize: 12
  },
  toggleAuthText: {
    color: '#94A3B8',
    fontSize: 12
  },

  // No Shop Container
  noShopContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  noShopCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center'
  },
  noShopTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center'
  },
  noShopSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18
  },

  // Main Container
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
  navLogo: {
    fontSize: 17,
    fontWeight: '800',
    color: '#60A5FA'
  },
  navUser: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  addShopBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  addShopBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11
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

  shopSelectorBar: {
    backgroundColor: '#0A0F1D',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingVertical: 8
  },
  shopSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  shopSelectChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3B82F6'
  },
  shopSelectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8'
  },
  shopSelectTextActive: {
    color: '#60A5FA'
  },

  shopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  shopBarName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  shopBarAddress: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  shopStatusCol: {
    alignItems: 'flex-end',
    gap: 4
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1E293B'
  },
  statusApproved: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  statusPending: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  statusSuspended: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  statusChipText: {
    fontSize: 9,
    fontWeight: '800'
  },
  pauseBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  pauseBtnText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '700'
  },

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
    borderBottomColor: '#3B82F6'
  },
  tabItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B'
  },
  tabItemTextActive: {
    color: '#60A5FA'
  },

  scrollBody: {
    padding: 16,
    paddingBottom: 40
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  sectionMeta: {
    fontSize: 12,
    color: '#94A3B8'
  },
  addBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12
  },

  // Queue Card
  queueCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  queueCardTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  queueNumBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  queueNumText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#60A5FA'
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  serviceName: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B'
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B'
  },

  // Earnings
  earningsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  earningsCard: {
    width: '48%',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#60A5FA'
  },
  earningsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 4
  },
  earningsSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4
  },
  guaranteeBox: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  guaranteeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 6
  },
  guaranteeDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18
  },

  // Service Card
  serviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  serviceMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  servicePrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981'
  },

  // Empty Card
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8'
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    color: '#F8FAFC',
    marginBottom: 16
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12
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
    backgroundColor: '#3B82F6',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '700'
  }
});
