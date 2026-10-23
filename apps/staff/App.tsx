import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shop,
  Service,
  QueueEntryWithDetails,
  getSupabaseClient
} from '@quickcut/shared';
import { StaffAuthScreen } from './src/screens/StaffAuthScreen';
import { StaffQRScannerModal } from './src/components/StaffQRScannerModal';
import { AddWalkinModal } from './src/components/AddWalkinModal';
import { QueueItemCard } from './src/components/QueueItemCard';

export default function StaffApp() {
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string } | null>(null);
  const [assignedShop, setAssignedShop] = useState<Shop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  // Queue state
  const [queue, setQueue] = useState<QueueEntryWithDetails[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);

  // Modals
  const [scannerVisible, setScannerVisible] = useState(false);
  const [walkinModalVisible, setWalkinModalVisible] = useState(false);
  const [targetEntryForQR, setTargetEntryForQR] = useState<QueueEntryWithDetails | null>(null);

  const supabase = getSupabaseClient();

  // Helper to log all state transitions to audit_logs
  const logAudit = async (action: string, entityId: string, payload: Record<string, unknown>) => {
    if (!sessionUser) return;
    try {
      await (supabase.from('audit_logs') as any).insert({
        user_id: sessionUser.id,
        action,
        entity_type: 'queue_entries',
        entity_id: entityId,
        payload
      });
    } catch (e) {
      console.warn('Audit logging failed:', e);
    }
  };

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
          await loadStaffShop(session.user.id);
        } else {
          setSessionUser(null);
          setAssignedShop(null);
        }
      } catch (err) {
        console.warn('Session error:', err);
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
          await loadStaffShop(session.user.id);
        } else {
          setSessionUser(null);
          setAssignedShop(null);
        }
        setAuthLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 2. Fetch Assigned Shop (Only sees assigned shop under RLS)
  const loadStaffShop = async (userId: string) => {
    try {
      // Find staff mapping
      const { data: staffData, error } = await supabase
        .from('shop_staff')
        .select('shop_id, role, shop:shops(*)')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (staffData && (staffData as any).shop) {
        const shop = (staffData as any).shop as Shop;
        setAssignedShop(shop);
        setIsQueuePaused(!!shop.is_queue_paused);
        await loadShopServices(shop.id);
      } else {
        setAssignedShop(null);
      }
    } catch (err) {
      console.warn('Error loading staff shop:', err);
      setAssignedShop(null);
    }
  };

  const loadShopServices = async (shopId: string) => {
    try {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true);

      setServices((data as unknown as Service[]) || []);
    } catch (err) {
      console.warn('Error loading services:', err);
    }
  };

  // 3. Load Today's Queue for Assigned Shop
  const loadTodayQueue = useCallback(async () => {
    if (!assignedShop) return;
    setLoadingQueue(true);

    try {
      const { data, error } = await supabase
        .from('queue_entries')
        .select(`
          *,
          service:services(*),
          barber:barbers(*)
        `)
        .eq('shop_id', assignedShop.id)
        .in('status', ['waiting', 'in_service'])
        .order('queue_number', { ascending: true });

      if (error) throw error;
      setQueue((data as unknown as QueueEntryWithDetails[]) || []);
    } catch (err) {
      console.warn('Error loading queue:', err);
    } finally {
      setLoadingQueue(false);
      setRefreshing(false);
    }
  }, [assignedShop]);

  useEffect(() => {
    if (assignedShop) {
      loadTodayQueue();

      // Realtime subscription for live updates
      const channel = supabase
        .channel(`staff-realtime-${assignedShop.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'queue_entries',
            filter: `shop_id=eq.${assignedShop.id}`
          },
          () => {
            loadTodayQueue();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [assignedShop, loadTodayQueue]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTodayQueue();
  };

  // Queue Item Actions
  const inChairEntry = queue.find((e) => e.status === 'in_service');
  const waitingEntries = queue.filter((e) => e.status === 'waiting');

  // Action: Start Service (Atomic database verification)
  const handleStartService = async (entry: QueueEntryWithDetails) => {
    try {
      const { data, error } = await (supabase.rpc as any)('start_service_atomic', {
        p_entry_id: entry.id,
        p_barber_id: entry.barber_id || null
      });

      if (error) throw error;

      await logAudit('SERVICE_STARTED', entry.id, {
        queue_number: entry.queue_number,
        previous_status: entry.status,
        new_status: 'in_service'
      });

      await loadTodayQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not start service';
      Alert.alert('Cannot Start Service', msg);
    }
  };

  // Action: Complete Service (With Check-in & Billing Invariant Warning)
  const handleCompleteService = (entry: QueueEntryWithDetails) => {
    const isCheckedIn = !!entry.checked_in_at;
    const isOnlineCustomer = !entry.is_walkin;

    const performComplete = async () => {
      try {
        const completionTime = new Date().toISOString();
        const { error } = await (supabase.from('queue_entries') as any)
          .update({
            status: 'completed',
            completed_at: completionTime
          })
          .eq('id', entry.id);

        if (error) throw error;

        const willBeBillable = isOnlineCustomer && isCheckedIn;
        await logAudit('SERVICE_COMPLETED', entry.id, {
          queue_number: entry.queue_number,
          is_walkin: entry.is_walkin,
          has_checked_in: isCheckedIn,
          is_billable: willBeBillable,
          platform_fee_inr: willBeBillable ? 5.0 : 0.0
        });

        Alert.alert(
          'Service Completed',
          `Ticket #${entry.queue_number} completed.\n\nPlatform Fee: ${
            willBeBillable ? '₹5.00 (Billable completion)' : '₹0.00 (Exempt: Walk-in or no QR check-in)'
          }`
        );

        await loadTodayQueue();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not complete service';
        Alert.alert('Error', msg);
      }
    };

    // Prominent Warning if completing online booking without QR arrival check-in
    if (isOnlineCustomer && !isCheckedIn) {
      Alert.alert(
        '⚠️ Non-Checked-In Warning',
        `This customer did NOT scan their QR check-in.\n\nUnder platform rules, this service will NOT qualify for billing (₹0.00 platform fee). Would you like to verify arrival check-in first?`,
        [
          {
            text: 'Verify QR Now',
            onPress: () => {
              setTargetEntryForQR(entry);
              setScannerVisible(true);
            }
          },
          {
            text: 'Complete Anyway (Non-Billable)',
            style: 'destructive',
            onPress: performComplete
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } else {
      performComplete();
    }
  };

  // Action: Mark Cancelled
  const handleMarkCancelled = (entry: QueueEntryWithDetails) => {
    Alert.alert(
      'Cancel Ticket',
      `Cancel ticket #${entry.queue_number} (${entry.guest_name || 'Customer'})?`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.from('queue_entries') as any)
                .update({ status: 'cancelled' })
                .eq('id', entry.id);

              if (error) throw error;

              await logAudit('QUEUE_ENTRY_CANCELLED_BY_STAFF', entry.id, {
                queue_number: entry.queue_number
              });

              await loadTodayQueue();
            } catch (err) {
              Alert.alert('Error', 'Could not cancel ticket');
            }
          }
        }
      ]
    );
  };

  // Action: Mark No-Show
  const handleMarkNoShow = (entry: QueueEntryWithDetails) => {
    Alert.alert(
      'Mark Customer No-Show',
      `Customer #${entry.queue_number} did not respond or show up?`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Mark No-Show',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.from('queue_entries') as any)
                .update({ status: 'no_show' })
                .eq('id', entry.id);

              if (error) throw error;

              await logAudit('CUSTOMER_MARKED_NO_SHOW', entry.id, {
                queue_number: entry.queue_number
              });

              await loadTodayQueue();
            } catch (err) {
              Alert.alert('Error', 'Could not mark no-show');
            }
          }
        }
      ]
    );
  };

  // Action: Add Walk-in Guest (marked is_walkin: true, never billable)
  const handleAddWalkin = async (guestName: string, serviceId: string) => {
    if (!assignedShop) return;

    const { data, error } = await (supabase.from('queue_entries') as any)
      .insert({
        shop_id: assignedShop.id,
        guest_name: `${guestName} (Walk-in)`,
        service_id: serviceId,
        is_walkin: true,
        is_billable: false, // Never billable per prompt rule
        checked_in_at: new Date().toISOString(), // In-store arrival confirmed
        status: 'waiting'
      })
      .select('id, queue_number')
      .single();

    if (error) throw error;

    await logAudit('WALKIN_CUSTOMER_ADDED', data.id, {
      queue_number: data.queue_number,
      guest_name: guestName,
      is_walkin: true,
      is_billable: false
    });

    Alert.alert('Walk-In Added', `Guest #${data.queue_number} enqueued.`);
    await loadTodayQueue();
  };

  // Action: Verify QR Check-in Code (Atomic verification RPC)
  const handleVerifyQRScan = async (codeOrToken: string) => {
    const trimmed = codeOrToken.trim();
    const target = targetEntryForQR || queue.find(
      (e) =>
        e.qr_code_token.toLowerCase() === trimmed.toLowerCase() ||
        String(e.queue_number) === trimmed
    );

    if (!target) {
      throw new Error(`No waiting ticket matched code "${codeOrToken}".`);
    }

    try {
      const { data, error } = await (supabase.rpc as any)('verify_qr_checkin', {
        p_entry_id: target.id,
        p_qr_token: trimmed
      });

      if (error) throw error;

      await logAudit('CUSTOMER_QR_CHECKED_IN', target.id, {
        queue_number: target.queue_number,
        verified_by_staff: true
      });

      Alert.alert('Check-In Verified', `Customer #${target.queue_number} is now verified in-store!`);
      setTargetEntryForQR(null);
      await loadTodayQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not verify check-in';
      throw new Error(msg);
    }
  };

  // Action: Pause / Resume Queue (Persisted to database)
  const handleTogglePauseQueue = async () => {
    if (!assignedShop) return;
    const nextState = !isQueuePaused;

    try {
      const { error } = await (supabase.from('shops') as any)
        .update({ is_queue_paused: nextState, updated_at: new Date().toISOString() })
        .eq('id', assignedShop.id);

      if (error) throw error;

      setIsQueuePaused(nextState);

      await logAudit(nextState ? 'QUEUE_PAUSED' : 'QUEUE_RESUMED', assignedShop.id, {
        paused: nextState,
        timestamp: new Date().toISOString()
      });

      Alert.alert(
        nextState ? 'Queue Paused' : 'Queue Resumed',
        nextState
          ? 'Queue is now paused in database. Notice is displayed to customers.'
          : 'Queue resumed. Ready to seat next customers.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update pause state';
      Alert.alert('Error', msg);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionUser(null);
    setAssignedShop(null);
  };

  // Auth Loading
  if (authLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingScreenText}>Loading Staff Portal...</Text>
      </View>
    );
  }

  // Auth Screen
  if (!sessionUser) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#090D16" />
        <StaffAuthScreen
          onLoginSuccess={async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              setSessionUser({ id: session.user.id, email: session.user.email || '' });
              await loadStaffShop(session.user.id);
            }
          }}
        />
      </SafeAreaView>
    );
  }

  // Unassigned Staff View (Strict authorization requirement)
  if (!assignedShop) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#090D16" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(239, 68, 68, 0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <Text style={{ fontSize: 24 }}>⚠️</Text>
          </View>
          <Text style={[styles.brandTitle, { fontSize: 20, textAlign: 'center', marginTop: 16 }]}>
            No Assigned Barber Shop
          </Text>
          <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
            Your account ({sessionUser.email}) is not currently linked to an active barber shop.
            {'\n\n'}
            Please ask your shop owner to link your User ID in their Owner Dashboard:
          </Text>
          <View style={{ backgroundColor: '#1E293B', padding: 12, borderRadius: 8, marginTop: 14, width: '100%' }}>
            <Text style={{ color: '#F8FAFC', fontSize: 13, textAlign: 'center', fontWeight: '700' }}>
              {sessionUser.id}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.logoutBtn, { marginTop: 28, paddingHorizontal: 28, paddingVertical: 12 }]}
            onPress={handleSignOut}
          >
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>QuickCut Staff Station</Text>
          <Text style={styles.shopSubtitle}>
            {assignedShop?.name || 'Assigned Barbershop'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.pauseBtn, isQueuePaused && styles.pauseBtnActive]}
            onPress={handleTogglePauseQueue}
          >
            <Text style={styles.pauseBtnText}>
              {isQueuePaused ? '▶ Resume' : '⏸ Pause'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Queue Paused Notification Banner */}
      {isQueuePaused && (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedBannerText}>
            ⏸ QUEUE IS CURRENTLY PAUSED FOR BUSY HOURS
          </Text>
        </View>
      )}

      {/* Fast Action Quick Bar */}
      <View style={styles.quickBar}>
        <TouchableOpacity
          style={styles.addWalkinBtn}
          onPress={() => setWalkinModalVisible(true)}
        >
          <Text style={styles.addWalkinBtnText}>+ Add Walk-In (Exempt)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.scanPassBtn}
          onPress={() => {
            setTargetEntryForQR(null);
            setScannerVisible(true);
          }}
        >
          <Text style={styles.scanPassBtnText}>📷 Scan Customer QR</Text>
        </TouchableOpacity>
      </View>

      {/* Queue Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
      >
        {/* Section: Currently In Chair */}
        {inChairEntry && (
          <View style={styles.section}>
            <QueueItemCard
              entry={inChairEntry}
              isNextUp={false}
              isInChair={true}
              onStartService={handleStartService}
              onCompleteService={handleCompleteService}
              onMarkCancelled={handleMarkCancelled}
              onMarkNoShow={handleMarkNoShow}
              onOpenQRCheckIn={(entry) => {
                setTargetEntryForQR(entry);
                setScannerVisible(true);
              }}
            />
          </View>
        )}

        {/* Section: Waiting Queue (Highlight next customer) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            WAITING QUEUE ({waitingEntries.length})
          </Text>
          <Text style={styles.liveSyncIndicator}>● Realtime Sync Active</Text>
        </View>

        {loadingQueue && queue.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={styles.loadingText}>Fetching live shop queue...</Text>
          </View>
        ) : waitingEntries.length === 0 && !inChairEntry ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Queue is Clear!</Text>
            <Text style={styles.emptySubtitle}>
              No customers are currently waiting. Add a walk-in or wait for incoming app bookings.
            </Text>
          </View>
        ) : (
          waitingEntries.map((entry, index) => (
            <QueueItemCard
              key={entry.id}
              entry={entry}
              isNextUp={index === 0 && !inChairEntry}
              isInChair={false}
              onStartService={handleStartService}
              onCompleteService={handleCompleteService}
              onMarkCancelled={handleMarkCancelled}
              onMarkNoShow={handleMarkNoShow}
              onOpenQRCheckIn={(e) => {
                setTargetEntryForQR(e);
                setScannerVisible(true);
              }}
            />
          ))
        )}
      </ScrollView>

      {/* Staff QR Scanner Modal */}
      <StaffQRScannerModal
        visible={scannerVisible}
        onClose={() => {
          setScannerVisible(false);
          setTargetEntryForQR(null);
        }}
        onVerifyCode={handleVerifyQRScan}
      />

      {/* Add Walk-In Modal */}
      <AddWalkinModal
        visible={walkinModalVisible}
        services={services}
        onClose={() => setWalkinModalVisible(false)}
        onAddWalkin={handleAddWalkin}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#090D16',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingScreenText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#38BDF8'
  },
  shopSubtitle: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pauseBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8'
  },
  pauseBtnActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444'
  },
  pauseBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800'
  },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  logoutBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700'
  },
  pausedBanner: {
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    alignItems: 'center'
  },
  pausedBannerText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1
  },
  quickBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  addWalkinBtn: {
    flex: 1,
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  addWalkinBtnText: {
    color: '#090D16',
    fontWeight: '900',
    fontSize: 14
  },
  scanPassBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8'
  },
  scanPassBtnText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 14
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  section: {
    marginBottom: 8
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1.2
  },
  liveSyncIndicator: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700'
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
  emptyBox: {
    backgroundColor: '#0F172A',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    marginTop: 10
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18
  }
});
