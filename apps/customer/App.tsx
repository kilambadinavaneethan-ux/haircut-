import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shop,
  Profile,
  QueueEntryWithDetails,
  formatEstimatedWaitDisplay,
  getSupabaseClient
} from '@quickcut/shared';
import { AuthScreen } from './src/screens/AuthScreen';
import { GoogleMapView, ShopWithQueueInfo } from './src/components/GoogleMapView';
import { ShopDetailModal } from './src/screens/ShopDetailModal';
import { LiveQueueScreen } from './src/screens/LiveQueueScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { requestNotificationPermissions } from './src/services/notifications';

export default function CustomerApp() {
  // Auth state
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App tabs
  const [currentTab, setCurrentTab] = useState<'shops' | 'live_queue' | 'history' | 'profile'>('shops');
  const [shopViewMode, setShopViewMode] = useState<'list' | 'map'>('list');

  // Shops & Queue state
  const [shops, setShops] = useState<ShopWithQueueInfo[]>([]);
  const [activeQueueEntry, setActiveQueueEntry] = useState<QueueEntryWithDetails | null>(null);
  const [selectedShop, setSelectedShop] = useState<ShopWithQueueInfo | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Loading & error states
  const [loadingShops, setLoadingShops] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  // 1. Initialize Auth and Notification Permissions
  useEffect(() => {
    requestNotificationPermissions();

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSessionUser({
            id: session.user.id,
            email: session.user.email || ''
          });
          await loadUserProfile(session.user.id);
        } else {
          setSessionUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.warn('Session check error:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setSessionUser({
            id: session.user.id,
            email: session.user.email || ''
          });
          await loadUserProfile(session.user.id);
        } else {
          setSessionUser(null);
          setProfile(null);
        }
        setAuthLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 2. Load User Profile from Supabase
  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
      }
    } catch (err) {
      console.warn('Could not load profile:', err);
    }
  };

  // 3. Load Approved Shops and Queue Metrics
  const loadShopsAndQueues = useCallback(async () => {
    setLoadingShops(true);
    setErrorMessage(null);

    try {
      // Fetch approved shops
      const { data: shopsData, error: shopsError } = await supabase
        .from('shops')
        .select('*')
        .eq('status', 'approved')
        .order('name');

      if (shopsError) throw shopsError;

      // Fetch active queue counts per shop
      const { data: queueData, error: queueError } = await supabase
        .from('queue_entries')
        .select('shop_id, status, service:services(avg_minutes)')
        .in('status', ['waiting', 'in_service']);

      if (queueError) throw queueError;

      const shopInfoMap: Record<string, { count: number; totalWait: number }> = {};

      if (queueData) {
        queueData.forEach((entry: any) => {
          if (!shopInfoMap[entry.shop_id]) {
            shopInfoMap[entry.shop_id] = { count: 0, totalWait: 0 };
          }
          shopInfoMap[entry.shop_id].count += 1;
          shopInfoMap[entry.shop_id].totalWait += entry.service?.avg_minutes || 20;
        });
      }

      const formattedShops: ShopWithQueueInfo[] = ((shopsData as unknown as Shop[]) || []).map((s: Shop) => ({
        ...s,
        queueLength: shopInfoMap[s.id]?.count || 0,
        estimatedWaitMinutes: shopInfoMap[s.id]?.totalWait || 0
      }));

      setShops(formattedShops);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not fetch shops';
      setErrorMessage(message);
    } finally {
      setLoadingShops(false);
      setRefreshing(false);
    }
  }, []);

  // 4. Load Customer's Current Active Queue Ticket
  const loadActiveQueueEntry = useCallback(async () => {
    if (!sessionUser) return;

    try {
      const { data, error } = await supabase
        .from('queue_entries')
        .select(`
          *,
          shop:shops(*),
          service:services(*)
        `)
        .eq('customer_id', sessionUser.id)
        .in('status', ['waiting', 'in_service'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveQueueEntry((data as unknown as QueueEntryWithDetails) || null);
    } catch (err) {
      console.warn('Error loading active ticket:', err);
    }
  }, [sessionUser]);

  useEffect(() => {
    if (sessionUser) {
      loadShopsAndQueues();
      loadActiveQueueEntry();
    }
  }, [sessionUser, loadShopsAndQueues, loadActiveQueueEntry]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadShopsAndQueues(), loadActiveQueueEntry()]);
    setRefreshing(false);
  };

  const handleOpenShopDetail = (shop: ShopWithQueueInfo) => {
    setSelectedShop(shop);
    setDetailModalVisible(true);
  };

  const handleQueueJoined = async () => {
    await loadActiveQueueEntry();
    setCurrentTab('live_queue');
  };

  // Loading state
  if (authLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.loadingScreenText}>Loading QuickCut...</Text>
      </View>
    );
  }

  // Auth Screen (Register & Login with Supabase Auth)
  if (!sessionUser) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <AuthScreen
          onAuthSuccess={async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              setSessionUser({ id: session.user.id, email: session.user.email || '' });
              await loadUserProfile(session.user.id);
            }
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logoTitle}>QuickCut</Text>
          <Text style={styles.welcomeText}>
            Hello, {profile?.full_name?.split(' ')[0] || 'Customer'}
          </Text>
        </View>

        {activeQueueEntry && (
          <TouchableOpacity
            style={styles.activeSpotPill}
            onPress={() => setCurrentTab('live_queue')}
          >
            <View style={styles.liveDot} />
            <Text style={styles.spotPillText}>Ticket #{activeQueueEntry.queue_number}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Navigation Tab Bar */}
      <View style={styles.navTabBar}>
        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'shops' && styles.tabItemActive]}
          onPress={() => setCurrentTab('shops')}
        >
          <Text style={[styles.tabItemText, currentTab === 'shops' && styles.tabItemTextActive]}>
            Shops
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'live_queue' && styles.tabItemActive]}
          onPress={() => setCurrentTab('live_queue')}
        >
          <Text style={[styles.tabItemText, currentTab === 'live_queue' && styles.tabItemTextActive]}>
            Live Queue {activeQueueEntry ? '●' : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'history' && styles.tabItemActive]}
          onPress={() => setCurrentTab('history')}
        >
          <Text style={[styles.tabItemText, currentTab === 'history' && styles.tabItemTextActive]}>
            History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'profile' && styles.tabItemActive]}
          onPress={() => setCurrentTab('profile')}
        >
          <Text style={[styles.tabItemText, currentTab === 'profile' && styles.tabItemTextActive]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {currentTab === 'shops' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor="#F59E0B" />}
        >
          {/* Subheader with View Toggle */}
          <View style={styles.shopsSubheader}>
            <Text style={styles.sectionHeading}>Nearby Approved Shops</Text>

            {/* List / Google Maps Toggle */}
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                style={[styles.toggleBtn, shopViewMode === 'list' && styles.toggleBtnActive]}
                onPress={() => setShopViewMode('list')}
              >
                <Text style={[styles.toggleText, shopViewMode === 'list' && styles.toggleTextActive]}>
                  List
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, shopViewMode === 'map' && styles.toggleBtnActive]}
                onPress={() => setShopViewMode('map')}
              >
                <Text style={[styles.toggleText, shopViewMode === 'map' && styles.toggleTextActive]}>
                  Map
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {loadingShops && shops.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.loadingText}>Finding nearby barber shops...</Text>
            </View>
          ) : shopViewMode === 'map' ? (
            /* Google Maps View */
            <GoogleMapView shops={shops} onSelectShop={handleOpenShopDetail} />
          ) : (
            /* List View */
            shops.map((shop) => (
              <View key={shop.id} style={styles.shopCard}>
                <View style={styles.shopCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shopCardName}>{shop.name}</Text>
                    <Text style={styles.shopCardAddress}>{shop.address}</Text>
                    <Text style={styles.shopCardHours}>
                      Hours: {shop.opening_time.slice(0, 5)} - {shop.closing_time.slice(0, 5)}
                    </Text>
                  </View>

                  {/* Estimated Wait Badge */}
                  <View style={styles.waitBadge}>
                    <Text style={styles.waitBadgeLabel}>Estimated Wait</Text>
                    <Text style={styles.waitBadgeTime}>
                      {formatEstimatedWaitDisplay(shop.estimatedWaitMinutes)}
                    </Text>
                    <Text style={styles.waitBadgeCount}>
                      {shop.queueLength} in queue
                    </Text>
                  </View>
                </View>

                {/* Estimate disclaimer banner */}
                <View style={styles.estimateBanner}>
                  <Text style={styles.estimateBannerText}>
                    * Wait time is dynamically estimated from current queue lengths.
                  </Text>
                </View>

                {/* CTA Action */}
                <TouchableOpacity
                  style={[
                    styles.viewShopBtn,
                    shop.is_queue_paused && { backgroundColor: '#334155' }
                  ]}
                  onPress={() => handleOpenShopDetail(shop)}
                >
                  <Text style={styles.viewShopBtnText}>
                    {shop.is_queue_paused ? '⏸️ Queue Paused — View Details' : 'View Services & Join Queue'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {!loadingShops && shops.length === 0 && (
            <View style={styles.emptyShopsBox}>
              <Text style={styles.emptyShopsTitle}>No Approved Shops Found</Text>
              <Text style={styles.emptyShopsDesc}>
                Approved barber shops will appear here once verified by platform administrators.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {currentTab === 'live_queue' && (
        <LiveQueueScreen
          activeEntry={activeQueueEntry}
          customerId={sessionUser.id}
          onRefresh={loadActiveQueueEntry}
          onNavigateToShops={() => setCurrentTab('shops')}
        />
      )}

      {currentTab === 'history' && <HistoryScreen customerId={sessionUser.id} />}

      {currentTab === 'profile' && (
        <ProfileScreen
          profile={profile}
          email={sessionUser.email}
          onSignOut={() => {
            setSessionUser(null);
            setProfile(null);
            setActiveQueueEntry(null);
          }}
        />
      )}

      {/* Shop Detail & Queue Join Modal */}
      <ShopDetailModal
        visible={detailModalVisible}
        shop={selectedShop}
        queueLength={selectedShop?.queueLength || 0}
        estimatedWaitMinutes={selectedShop?.estimatedWaitMinutes || 0}
        customerId={sessionUser.id}
        hasActiveTicket={!!activeQueueEntry}
        activeTicketNumber={activeQueueEntry?.queue_number}
        activeShopName={activeQueueEntry?.shop?.name}
        onClose={() => setDetailModalVisible(false)}
        onJoinedQueueSuccess={handleQueueJoined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingScreenText: {
    color: '#94A3B8',
    marginTop: 14,
    fontSize: 14
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  logoTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 0.5
  },
  welcomeText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1
  },
  activeSpotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F59E0B'
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6
  },
  spotPillText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700'
  },
  navTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    padding: 4
  },
  tabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8
  },
  tabItemActive: {
    backgroundColor: '#F59E0B'
  },
  tabItemText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700'
  },
  tabItemTextActive: {
    color: '#0F172A'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  shopsSubheader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#334155'
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6
  },
  toggleBtnActive: {
    backgroundColor: '#0F172A'
  },
  toggleText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600'
  },
  toggleTextActive: {
    color: '#F59E0B'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center'
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10
  },
  shopCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  shopCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  shopCardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  shopCardAddress: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  shopCardHours: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4
  },
  waitBadge: {
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
    minWidth: 95
  },
  waitBadgeLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  waitBadgeTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F59E0B',
    marginTop: 2
  },
  waitBadgeCount: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1
  },
  estimateBanner: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 12,
    marginBottom: 12
  },
  estimateBannerText: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic'
  },
  viewShopBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  viewShopBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700'
  },
  emptyShopsBox: {
    backgroundColor: '#1E293B',
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20
  },
  emptyShopsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  emptyShopsDesc: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4
  }
});
