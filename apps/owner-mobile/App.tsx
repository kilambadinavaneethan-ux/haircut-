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
  Barber,
  ShopStaff,
  Profile,
  getSupabaseClient,
  createIsolatedAuthClient
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
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [staffList, setStaffList] = useState<(ShopStaff & { profile?: Profile })[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'staff' | 'services' | 'earnings'>('queue');
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

  // Staff Account Provisioning Modal (Owner gives Staff ID & Password)
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('Password123!');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState<'barber' | 'senior_barber' | 'manager'>('barber');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [staffModalError, setStaffModalError] = useState<string | null>(null);

  // Issued Credentials Modal / Card (Shown to owner after creation)
  const [issuedStaffCredentials, setIssuedStaffCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    role: string;
    shopName: string;
  } | null>(null);

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

        // Load barbers roster for this shop
        const { data: dbBarbers } = await supabase
          .from('barbers')
          .select('*')
          .eq('shop_id', targetId)
          .order('name');

        if (dbBarbers) setBarbers(dbBarbers as Barber[]);

        // Load staff mapping for this shop
        const { data: dbStaff } = await supabase
          .from('shop_staff')
          .select('*, profile:profiles(*)')
          .eq('shop_id', targetId);

        if (dbStaff) setStaffList(dbStaff as unknown as (ShopStaff & { profile?: Profile })[]);
      } else {
        setServices([]);
        setQueueEntries([]);
        setBarbers([]);
        setStaffList([]);
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

  // 4b. Staff Account Management (Owner provisions Staff ID & Password)
  const handleCreateStaffAccount = async () => {
    if (!activeShop) {
      Alert.alert('No Shop Selected', 'Please register or select a barbershop first.');
      return;
    }
    if (!staffName.trim()) {
      setStaffModalError('Please enter the barber staff full name.');
      return;
    }
    if (!staffEmail.trim()) {
      setStaffModalError('Please enter the staff login ID (Email).');
      return;
    }
    if (!staffPassword || staffPassword.length < 6) {
      setStaffModalError('Password must be at least 6 characters.');
      return;
    }

    setCreatingStaff(true);
    setStaffModalError(null);

    try {
      // 1. Sign up staff member via isolated auth client (keeps owner logged in)
      const isolatedAuth = createIsolatedAuthClient();
      const { data: authData, error: authErr } = await isolatedAuth.auth.signUp({
        email: staffEmail.trim(),
        password: staffPassword,
        options: {
          data: {
            full_name: staffName.trim(),
            role: 'staff',
            phone: staffPhone.trim() || null
          }
        }
      });

      if (authErr) throw authErr;

      const staffUserId = authData.user?.id || authData.session?.user?.id;
      if (!staffUserId) {
        throw new Error('Staff user ID could not be generated. Please try again.');
      }

      // 2. Upsert profile with role 'staff'
      const newStaffProfile: Profile = {
        id: staffUserId,
        role: 'staff',
        full_name: staffName.trim(),
        phone: staffPhone.trim() || null,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await (supabase.from('profiles') as any).upsert(newStaffProfile);

      // 3. Link staff to this owner's barbershop
      await (supabase.from('shop_staff') as any).upsert({
        shop_id: activeShop.id,
        user_id: staffUserId,
        role: staffRole
      });

      // 4. Create barber station for queue dispatch & wait-time simulation
      await (supabase.from('barbers') as any).insert({
        shop_id: activeShop.id,
        user_id: staffUserId,
        name: staffName.trim(),
        is_active: true
      });

      // 5. Log audit trail
      if (ownerUser) {
        await (supabase.from('audit_logs') as any).insert({
          user_id: ownerUser.id,
          action: 'STAFF_ACCOUNT_PROVISIONED_BY_OWNER',
          entity_type: 'shop_staff',
          entity_id: staffUserId,
          payload: {
            shop_id: activeShop.id,
            shop_name: activeShop.name,
            staff_name: staffName.trim(),
            staff_email: staffEmail.trim(),
            role: staffRole
          }
        });
      }

      // 6. Record issued credentials to display to the owner
      setIssuedStaffCredentials({
        name: staffName.trim(),
        email: staffEmail.trim(),
        password: staffPassword,
        role: staffRole,
        shopName: activeShop.name
      });

      // Reset form
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('Password123!');
      setStaffPhone('');
      setStaffModalVisible(false);

      await loadOwnerData();
    } catch (err: any) {
      setStaffModalError(err.message || 'Failed to create staff account.');
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleToggleBarberActive = async (barber: Barber) => {
    try {
      const nextStatus = !barber.is_active;
      const { error } = await (supabase.from('barbers') as any)
        .update({ is_active: nextStatus })
        .eq('id', barber.id);

      if (error) throw error;
      setBarbers((prev) =>
        prev.map((b) => (b.id === barber.id ? { ...b, is_active: nextStatus } : b))
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update barber status.');
    }
  };

  const handleDeleteBarber = (barberId: string, name: string) => {
    Alert.alert(
      'Remove Barber',
      `Remove "${name}" from your shop roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.from('barbers') as any)
                .delete()
                .eq('id', barberId);

              if (error) throw error;
              setBarbers((prev) => prev.filter((b) => b.id !== barberId));
              Alert.alert('Removed', `Barber "${name}" has been removed from this shop.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not remove barber.');
            }
          }
        }
      ]
    );
  };

  const handleAutofillStaffDemo = () => {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    setStaffName(`Barber Staff ${randomSuffix}`);
    setStaffEmail(`staff.barber${randomSuffix}@quickcut.com`);
    setStaffPassword('Password123!');
    setStaffPhone('+91 97777 33333');
    setStaffRole('barber');
  };

  // 4c. Direct Owner Queue Actions (Accept / Seat / Complete / Verify)
  const handleOwnerVerifyCheckIn = async (entry: QueueEntryWithDetails) => {
    try {
      const token = entry.qr_code_token || 'DIRECT_OWNER_VERIFIED';
      const { error: rpcErr } = await (supabase.rpc as any)('verify_qr_checkin', {
        p_entry_id: entry.id,
        p_qr_token: token
      });

      if (rpcErr) {
        // Fallback update checked_in_at
        const { error } = await (supabase.from('queue_entries') as any)
          .update({ checked_in_at: new Date().toISOString() })
          .eq('id', entry.id);
        if (error) throw error;
      }

      Alert.alert(
        'Arrival Verified',
        `Customer #${entry.queue_number} (${entry.customer?.full_name || entry.guest_name || 'Customer'}) arrival has been verified in-store!`
      );
      await loadOwnerData();
    } catch (err: any) {
      Alert.alert('Verification Error', err.message || 'Could not verify customer arrival.');
    }
  };

  const handleOwnerStartService = async (entry: QueueEntryWithDetails) => {
    try {
      const { error: rpcErr } = await (supabase.rpc as any)('start_service_atomic', {
        p_entry_id: entry.id,
        p_barber_id: entry.barber_id || null
      });

      if (rpcErr) {
        const { error } = await (supabase.from('queue_entries') as any)
          .update({
            status: 'in_service',
            called_at: new Date().toISOString()
          })
          .eq('id', entry.id);
        if (error) throw error;
      }

      Alert.alert(
        'Service Started',
        `Customer #${entry.queue_number} (${entry.customer?.full_name || entry.guest_name || 'Customer'}) is now seated in the chair!`
      );
      await loadOwnerData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start service.');
    }
  };

  const handleOwnerCompleteService = async (entry: QueueEntryWithDetails) => {
    try {
      const { error: rpcErr } = await (supabase.rpc as any)('complete_service_atomic', {
        p_entry_id: entry.id
      });

      if (rpcErr) {
        const { error } = await (supabase.from('queue_entries') as any)
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', entry.id);
        if (error) throw error;
      }

      Alert.alert(
        'Service Completed',
        `Haircut for #${entry.queue_number} completed. Revenue added to your Earnings tab (Strict ₹0 fee)!`
      );
      await loadOwnerData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not complete service.');
    }
  };

  const handleOwnerCancelTicket = (entry: QueueEntryWithDetails) => {
    Alert.alert(
      'Cancel Ticket',
      `Cancel ticket #${entry.queue_number} (${entry.customer?.full_name || entry.guest_name || 'Customer'})?`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Ticket',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.from('queue_entries') as any)
                .update({ status: 'cancelled' })
                .eq('id', entry.id);
              if (error) throw error;
              await loadOwnerData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not cancel ticket.');
            }
          }
        }
      ]
    );
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
        <View style={styles.shopSelectorWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shopSelectorContent}
          >
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
        </View>
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
            💈 Queue ({waitingEntries.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'staff' && styles.tabItemActive]}
          onPress={() => setActiveTab('staff')}
        >
          <Text style={[styles.tabItemText, activeTab === 'staff' && styles.tabItemTextActive]}>
            👥 Staff ({barbers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'services' && styles.tabItemActive]}
          onPress={() => setActiveTab('services')}
        >
          <Text style={[styles.tabItemText, activeTab === 'services' && styles.tabItemTextActive]}>
            ✂️ Menu ({services.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'earnings' && styles.tabItemActive]}
          onPress={() => setActiveTab('earnings')}
        >
          <Text style={[styles.tabItemText, activeTab === 'earnings' && styles.tabItemTextActive]}>
            💰 Revenue
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
              waitingEntries.map((entry) => {
                const isCheckedIn = !!entry.checked_in_at;
                const isInChair = entry.status === 'in_service';
                return (
                  <View key={entry.id} style={[styles.queueCard, isInChair && styles.queueCardInChair]}>
                    <View style={styles.queueCardTop}>
                      <View style={[styles.queueNumBadge, isInChair && { backgroundColor: '#10B981' }]}>
                        <Text style={styles.queueNumText}>#{entry.queue_number}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.customerName}>
                          {entry.customer?.full_name || entry.guest_name || 'Walk-in Guest'}
                        </Text>
                        <Text style={styles.serviceName}>
                          ✂️ {entry.service?.name || 'Haircut Service'} (₹{entry.service?.price || 200})
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View
                            style={[
                              styles.arrivalStatusPill,
                              isCheckedIn ? styles.arrivalStatusPillVerified : styles.arrivalStatusPillWaiting
                            ]}
                          >
                            <Text
                              style={[
                                styles.arrivalStatusText,
                                isCheckedIn ? { color: '#10B981' } : { color: '#F59E0B' }
                              ]}
                            >
                              {isCheckedIn ? '✓ Arrival Verified' : '⏳ Waiting Arrival Pass'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={[styles.statusPill, isInChair && { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                        <Text style={[styles.statusPillText, isInChair && { color: '#10B981' }]}>
                          {isInChair ? 'IN CHAIR' : entry.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Quick Action Buttons for Owner */}
                    <View style={styles.queueActionsRow}>
                      {!isCheckedIn && (
                        <TouchableOpacity
                          style={styles.actionVerifyBtn}
                          onPress={() => handleOwnerVerifyCheckIn(entry)}
                        >
                          <Text style={styles.actionVerifyText}>✓ Accept Arrival</Text>
                        </TouchableOpacity>
                      )}

                      {!isInChair ? (
                        <TouchableOpacity
                          style={styles.actionSeatBtn}
                          onPress={() => handleOwnerStartService(entry)}
                        >
                          <Text style={styles.actionSeatText}>▶ Seat / Start Service</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.actionCompleteBtn}
                          onPress={() => handleOwnerCompleteService(entry)}
                        >
                          <Text style={styles.actionCompleteText}>✓ Complete Cut</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.actionCancelBtn}
                        onPress={() => handleOwnerCancelTicket(entry)}
                      >
                        <Text style={styles.actionCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 2: STAFF BARBERS & ACCOUNTS        */}
        {/* ======================================= */}
        {activeTab === 'staff' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Staff Barbers & Accounts</Text>
                <Text style={styles.sectionMeta}>{barbers.length} Barbers Assigned</Text>
              </View>
              <TouchableOpacity
                style={styles.addStaffHeaderBtn}
                onPress={() => {
                  setStaffModalError(null);
                  setStaffModalVisible(true);
                }}
              >
                <Text style={styles.addStaffHeaderBtnText}>+ Give Staff Account</Text>
              </TouchableOpacity>
            </View>

            {/* Instruction banner */}
            <View style={styles.staffNoticeBanner}>
              <Text style={styles.staffNoticeTitle}>🔑 Barber Staff Login Access</Text>
              <Text style={styles.staffNoticeDesc}>
                Create login IDs and passwords below. Your staff barbers use these credentials to log into the QuickCut Staff App to call customers, update queue status, and scan arrival passes.
              </Text>
            </View>

            {/* Shop Owner Referral Code Card */}
            <View style={styles.ownerReferralCard}>
              <View style={styles.ownerReferralHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ownerReferralTag}>🏬 SHOP OWNER REFERRAL CODE</Text>
                  <Text style={styles.ownerReferralCode}>
                    {activeShop.referral_code || `${activeShop.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}2026`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.ownerReferralCopyBtn}
                  onPress={() => {
                    const code = activeShop.referral_code || `${activeShop.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}2026`;
                    Alert.alert(
                      'Shop Referral Code',
                      `Give this code to new customers:\n\n${code}\n\nCustomers enter this code when creating their account in the Customer App to link with ${activeShop.name}.`
                    );
                  }}
                >
                  <Text style={styles.ownerReferralCopyText}>📋 Share Code</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.ownerReferralDesc}>
                Give this code to customers when they register in the Customer App. You can also give any barber&apos;s individual code below!
              </Text>
            </View>

            {barbers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>💈</Text>
                <Text style={styles.emptyTitle}>No Staff Barbers Added Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Give your barbers their login credentials so they can access this shop&apos;s queue.
                </Text>
                <TouchableOpacity
                  style={[styles.addStaffHeaderBtn, { marginTop: 14, alignSelf: 'center' }]}
                  onPress={() => {
                    setStaffModalError(null);
                    setStaffModalVisible(true);
                  }}
                >
                  <Text style={styles.addStaffHeaderBtnText}>+ Create Staff Account (ID & Password)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              barbers.map((b) => {
                const linkedStaff = staffList.find((s) => s.user_id === b.user_id);
                const staffProfile = linkedStaff?.profile;
                return (
                  <View key={b.id} style={styles.staffCard}>
                    <View style={styles.staffCardTop}>
                      <View style={styles.staffAvatar}>
                        <Text style={styles.staffAvatarEmoji}>💈</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.staffNameText}>{b.name}</Text>
                          <View style={styles.staffRolePill}>
                            <Text style={styles.staffRolePillText}>
                              {(linkedStaff?.role || 'BARBER').toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.staffEmailText}>
                          🆔 {b.user_id ? `User: ${b.user_id.slice(0, 8)}...` : 'Local Station'}
                          {staffProfile?.phone ? ` • 📞 ${staffProfile.phone}` : ''}
                        </Text>
                      </View>

                      {/* Active Status Badge */}
                      <TouchableOpacity
                        style={[
                          styles.staffStatusBadge,
                          b.is_active ? styles.staffStatusActive : styles.staffStatusInactive
                        ]}
                        onPress={() => handleToggleBarberActive(b)}
                      >
                        <Text
                          style={[
                            styles.staffStatusText,
                            b.is_active ? styles.staffStatusTextActive : styles.staffStatusTextInactive
                          ]}
                        >
                          {b.is_active ? '🟢 Serving' : '⚪ On Break'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Barber Personal Referral Code */}
                    <View style={styles.barberReferralRow}>
                      <View style={styles.barberReferralPill}>
                        <Text style={styles.barberReferralLabel}>🎁 Referral Code:</Text>
                        <Text style={styles.barberReferralCodeText}>
                          {b.referral_code || `STF-${b.name.replace(/[^a-zA-Z0-9 ]/g, '').split(' ')[0].toUpperCase()}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.barberCopyBtn}
                        onPress={() => {
                          const code = b.referral_code || `STF-${b.name.replace(/[^a-zA-Z0-9 ]/g, '').split(' ')[0].toUpperCase()}`;
                          Alert.alert(
                            'Staff Referral Code',
                            `Share this code with customers for ${b.name}:\n\n${code}\n\nCustomers enter this code when signing up in the Customer App.`
                          );
                        }}
                      >
                        <Text style={styles.barberCopyText}>📋 Copy Code</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.staffCardActions}>
                      <TouchableOpacity
                        style={styles.staffActionBtn}
                        onPress={() => handleToggleBarberActive(b)}
                      >
                        <Text style={styles.staffActionBtnText}>
                          {b.is_active ? 'Set to Break' : 'Set to Serving'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.staffActionBtn, styles.staffDeleteBtn]}
                        onPress={() => handleDeleteBarber(b.id, b.name)}
                      >
                        <Text style={[styles.staffActionBtnText, { color: '#EF4444' }]}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ======================================= */}
        {/* TAB 3: EARNINGS & ZERO FEE POLICY       */}
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

      {/* ======================================= */}
      {/* MODAL: CREATE STAFF ACCOUNT (ID & PWD)  */}
      {/* ======================================= */}
      <Modal visible={staffModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Give Staff Account (ID & Password)</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 14 }}>
              Set up a barber staff login for &quot;{activeShop?.name}&quot;. They will use this Email/ID and Password to log in on the Staff Barber App.
            </Text>

            {staffModalError && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorAlertText}>⚠️ {staffModalError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff Barber Full Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Sam Wilson"
                placeholderTextColor="#64748B"
                value={staffName}
                onChangeText={setStaffName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff Login ID (Email) *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="staff.sam@quickcut.com"
                placeholderTextColor="#64748B"
                value={staffEmail}
                onChangeText={setStaffEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff Password *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Password123!"
                placeholderTextColor="#64748B"
                value={staffPassword}
                onChangeText={setStaffPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff Phone Number (Optional)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="+91 97777 33333"
                placeholderTextColor="#64748B"
                value={staffPhone}
                onChangeText={setStaffPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Role / Position</Text>
              <View style={styles.rolePickerRow}>
                {(['barber', 'senior_barber', 'manager'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, staffRole === r && styles.roleChipActive]}
                    onPress={() => setStaffRole(r)}
                  >
                    <Text style={[styles.roleChipText, staffRole === r && styles.roleChipTextActive]}>
                      {r === 'barber' ? 'Barber' : r === 'senior_barber' ? 'Senior Stylist' : 'Manager'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Autofill Demo Button */}
            <TouchableOpacity style={styles.seedButton} onPress={handleAutofillStaffDemo}>
              <Text style={styles.seedButtonText}>⚡ Autofill Staff Credentials (staff.sam@quickcut.com)</Text>
            </TouchableOpacity>

            <View style={[styles.modalButtons, { marginTop: 16 }]}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setStaffModalVisible(false)}
                disabled={creatingStaff}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={handleCreateStaffAccount}
                disabled={creatingStaff}
              >
                {creatingStaff ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Create Staff Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================= */}
      {/* MODAL: ISSUED CREDENTIALS RECEIPT       */}
      {/* ======================================= */}
      <Modal visible={!!issuedStaffCredentials} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.credentialsModalContent}>
            <Text style={styles.credentialsTitle}>🎉 Staff Account Ready!</Text>
            <Text style={styles.credentialsSubtitle}>
              Give these login credentials to your staff barber so they can access the QuickCut Staff App:
            </Text>

            <View style={styles.credentialsBox}>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>BARBER NAME:</Text>
                <Text style={styles.credValue}>{issuedStaffCredentials?.name}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>STAFF LOGIN ID (EMAIL):</Text>
                <Text style={styles.credHighlight}>{issuedStaffCredentials?.email}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>STAFF PASSWORD:</Text>
                <Text style={styles.credHighlight}>{issuedStaffCredentials?.password}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>ASSIGNED SHOP:</Text>
                <Text style={styles.credValue}>{issuedStaffCredentials?.shopName}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>ROLE:</Text>
                <Text style={styles.credValue}>
                  {issuedStaffCredentials?.role.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.credentialsTipBox}>
              <Text style={styles.credentialsTipText}>
                💡 Barber instructions: Open the QuickCut Staff App, enter the Login ID and Password above, and tap &quot;Staff Sign In&quot;.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.credentialsDoneBtn}
              onPress={() => setIssuedStaffCredentials(null)}
            >
              <Text style={styles.credentialsDoneBtnText}>Done</Text>
            </TouchableOpacity>
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

  shopSelectorWrapper: {
    backgroundColor: '#0A0F1D',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingVertical: 8
  },
  shopSelectorContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  shopSelectChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
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

  queueCardInChair: {
    borderColor: '#10B981',
    backgroundColor: '#0A1820'
  },
  arrivalStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8
  },
  arrivalStatusPillVerified: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)'
  },
  arrivalStatusPillWaiting: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)'
  },
  arrivalStatusText: {
    fontSize: 10,
    fontWeight: '700'
  },
  queueActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    paddingTop: 10,
    flexWrap: 'wrap'
  },
  actionVerifyBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionVerifyText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },
  actionSeatBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionSeatText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },
  actionCompleteBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionCompleteText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },
  actionCancelBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionCancelText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600'
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
  },

  // Staff Management Styles
  addStaffHeaderBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8
  },
  addStaffHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12
  },
  staffNoticeBanner: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14
  },
  staffNoticeTitle: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3
  },
  staffNoticeDesc: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16
  },
  ownerReferralCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B'
  },
  ownerReferralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  ownerReferralTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.5
  },
  ownerReferralCode: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    marginTop: 2,
    letterSpacing: 1
  },
  ownerReferralCopyBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  ownerReferralCopyText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700'
  },
  ownerReferralDesc: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15
  },
  barberReferralRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  barberReferralPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  barberReferralLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600'
  },
  barberReferralCodeText: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '800',
    letterSpacing: 0.5
  },
  barberCopyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#1E293B'
  },
  barberCopyText: {
    fontSize: 10,
    color: '#CBD5E1',
    fontWeight: '600'
  },
  staffCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  staffCardTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  staffAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center'
  },
  staffAvatarEmoji: {
    fontSize: 18
  },
  staffNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  staffRolePill: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  staffRolePillText: {
    color: '#60A5FA',
    fontSize: 9,
    fontWeight: '800'
  },
  staffEmailText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3
  },
  staffStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  staffStatusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)'
  },
  staffStatusInactive: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)'
  },
  staffStatusText: {
    fontSize: 10,
    fontWeight: '700'
  },
  staffStatusTextActive: {
    color: '#10B981'
  },
  staffStatusTextInactive: {
    color: '#94A3B8'
  },
  staffCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    paddingTop: 8
  },
  staffActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1E293B'
  },
  staffActionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1'
  },
  staffDeleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8
  },
  roleChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center'
  },
  roleChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3B82F6'
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8'
  },
  roleChipTextActive: {
    color: '#60A5FA',
    fontWeight: '700'
  },

  // Issued Credentials Receipt
  credentialsModalContent: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  credentialsTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 6
  },
  credentialsSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16
  },
  credentialsBox: {
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14
  },
  credRow: {
    marginBottom: 8
  },
  credLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5
  },
  credValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2
  },
  credHighlight: {
    fontSize: 15,
    fontWeight: '800',
    color: '#60A5FA',
    marginTop: 2
  },
  credentialsTipBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16
  },
  credentialsTipText: {
    fontSize: 11,
    color: '#93C5FD',
    lineHeight: 16
  },
  credentialsDoneBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  credentialsDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  }
});
