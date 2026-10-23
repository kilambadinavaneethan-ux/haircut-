import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import {
  QueueEntryWithDetails,
  formatEstimatedWaitDisplay,
  getSupabaseClient
} from '@quickcut/shared';
import { notifyTwoAhead } from '../services/notifications';
import { QRScannerModal } from '../components/QRScannerModal';

interface LiveQueueScreenProps {
  activeEntry: QueueEntryWithDetails | null;
  customerId: string;
  onRefresh: () => Promise<void>;
  onNavigateToShops: () => void;
}

export function LiveQueueScreen({
  activeEntry,
  customerId,
  onRefresh,
  onNavigateToShops
}: LiveQueueScreenProps) {
  const [peopleAhead, setPeopleAhead] = useState(0);
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Prevent multiple duplicate push notifications for the same ticket
  const notifiedTwoAheadRef = useRef<boolean>(false);

  const supabase = getSupabaseClient();

  useEffect(() => {
    notifiedTwoAheadRef.current = false;
  }, [activeEntry?.id]);

  // Compute live position & estimated wait time from queue
  const calculateLiveQueueStatus = async () => {
    if (!activeEntry || activeEntry.status !== 'waiting') {
      return;
    }

    try {
      // 1. Try secure database RPC first
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'get_estimated_wait_time',
        { target_queue_entry_id: activeEntry.id }
      );

      if (!rpcError && rpcData) {
        const ahead = rpcData.people_ahead || 0;
        const mins = rpcData.estimated_minutes || 0;
        setPeopleAhead(ahead);
        setEstimatedMinutes(mins);

        if (ahead === 2 && !notifiedTwoAheadRef.current) {
          notifiedTwoAheadRef.current = true;
          await notifyTwoAhead(
            activeEntry.shop?.name || 'the Barbershop',
            activeEntry.queue_number
          );
        }
        return;
      }

      // 2. Fallback query (Strict deduplication - no double counting)
      const { data: waitingAhead } = await supabase
        .from('queue_entries')
        .select('id, status, created_at, service:services(avg_minutes)')
        .eq('shop_id', activeEntry.shop_id)
        .eq('status', 'waiting')
        .lt('created_at', activeEntry.created_at);

      const { data: inServiceEntries } = await supabase
        .from('queue_entries')
        .select('id, service:services(avg_minutes)')
        .eq('shop_id', activeEntry.shop_id)
        .eq('status', 'in_service');

      const uniqueInService = (inServiceEntries as any[] || []).filter((e: any) => e.id !== activeEntry.id);
      const uniqueWaiting = (waitingAhead as any[]) || [];

      const aheadCount = uniqueWaiting.length + uniqueInService.length;
      setPeopleAhead(aheadCount);

      let totalWait = 0;
      uniqueWaiting.forEach((e: any) => {
        totalWait += e.service?.avg_minutes || 20;
      });
      uniqueInService.forEach((e: any) => {
        totalWait += e.service?.avg_minutes || 20;
      });
      setEstimatedMinutes(totalWait);

      // Trigger Push Notification when exactly 2 customers are ahead
      if (aheadCount === 2 && !notifiedTwoAheadRef.current) {
        notifiedTwoAheadRef.current = true;
        await notifyTwoAhead(
          activeEntry.shop?.name || 'the Barbershop',
          activeEntry.queue_number
        );
      }
    } catch (err) {
      console.warn('Error calculating live queue status:', err);
    }
  };

  // Set up Supabase Realtime channel for live updates
  useEffect(() => {
    if (!activeEntry) return;

    calculateLiveQueueStatus();

    const channel = supabase
      .channel(`shop-queue-${activeEntry.shop_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `shop_id=eq.${activeEntry.shop_id}`
        },
        async () => {
          await calculateLiveQueueStatus();
          await onRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeEntry?.id, activeEntry?.shop_id]);

  // Cancel queue entry
  const handleCancelQueue = () => {
    if (!activeEntry) return;

    Alert.alert(
      'Cancel Queue Spot',
      'Are you sure you want to surrender your spot in line?',
      [
        { text: 'Keep Spot', style: 'cancel' },
        {
          text: 'Leave Queue',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const { error } = await (supabase.from('queue_entries') as any)
                .update({ status: 'cancelled' })
                .eq('id', activeEntry.id);

              if (error) throw error;
              Alert.alert('Left Queue', 'Your queue ticket has been cancelled.');
              await onRefresh();
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Could not cancel ticket';
              Alert.alert('Error', message);
            } finally {
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  // Check in upon scanning shop QR code
  const handleCheckInSuccess = async (tokenOrCode: string) => {
    if (!activeEntry) return;

    try {
      // 1. Try secure database RPC
      const { data, error } = await (supabase.rpc as any)('verify_qr_checkin', {
        p_entry_id: activeEntry.id,
        p_qr_token: tokenOrCode.trim()
      });

      if (error) throw error;

      Alert.alert('Checked In Successfully!', 'Your arrival has been verified by the shop.');
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid shop QR code';
      Alert.alert('Check-In Failed', msg);
    }
  };

  if (!activeEntry) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Text style={styles.emptyIcon}>🎫</Text>
        </View>
        <Text style={styles.emptyTitle}>No Active Queue Ticket</Text>
        <Text style={styles.emptySubtitle}>
          You are not currently in any shop queue. Browse nearby barber shops to take your ticket!
        </Text>
        <TouchableOpacity style={styles.exploreBtn} onPress={onNavigateToShops}>
          <Text style={styles.exploreBtnText}>Find Barber Shops</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCheckedIn = !!activeEntry.checked_in_at;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Realtime Status Banner */}
      <View
        style={[
          styles.statusBanner,
          activeEntry.status === 'in_service' ? styles.statusInService : styles.statusWaiting
        ]}
      >
        <Text style={styles.statusBannerText}>
          {activeEntry.status === 'in_service'
            ? 'CURRENTLY IN CHAIR'
            : isCheckedIn
            ? 'ARRIVED & CHECKED IN'
            : 'WAITING IN QUEUE'}
        </Text>
      </View>

      {/* Main Ticket Card */}
      <View style={styles.ticketCard}>
        <Text style={styles.ticketLabel}>YOUR QUEUE NUMBER</Text>
        <Text style={styles.ticketNumber}>#{activeEntry.queue_number}</Text>
        <Text style={styles.shopTitle}>{activeEntry.shop?.name}</Text>
        <Text style={styles.serviceSubtitle}>
          {activeEntry.service?.name} • ₹{activeEntry.service?.price}
        </Text>

        {/* Live Estimated Wait Badge (Marked as an estimate) */}
        <View style={styles.estimateCard}>
          <Text style={styles.estimateTitle}>ESTIMATED WAIT TIME</Text>
          <Text style={styles.estimateMinutes}>
            {formatEstimatedWaitDisplay(estimatedMinutes)}
          </Text>
          <Text style={styles.peopleAheadText}>
            {peopleAhead} {peopleAhead === 1 ? 'customer' : 'customers'} currently ahead of you
          </Text>
          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
              * Real-time estimate dynamically calculated from remaining service durations. Actual time may vary.
            </Text>
          </View>
        </View>

        {/* Check-In Status Card */}
        <View style={styles.checkInCard}>
          <View style={styles.checkInRow}>
            <View>
              <Text style={styles.checkInTitle}>Arrival Check-In</Text>
              <Text style={styles.checkInSubtitle}>
                {isCheckedIn
                  ? 'Verified: You are marked as present at the shop.'
                  : 'Scan the shop QR code when you arrive to confirm presence.'}
              </Text>
            </View>
            <View
              style={[
                styles.checkInStatusBadge,
                isCheckedIn ? styles.badgeVerified : styles.badgePending
              ]}
            >
              <Text
                style={[
                  styles.checkInStatusText,
                  isCheckedIn ? styles.textVerified : styles.textPending
                ]}
              >
                {isCheckedIn ? 'CHECKED IN' : 'NOT CHECKED IN'}
              </Text>
            </View>
          </View>

          {!isCheckedIn && (
            <TouchableOpacity
              style={styles.scanShopQrBtn}
              onPress={() => setScannerVisible(true)}
            >
              <Text style={styles.scanShopQrBtnText}>📷 Scan Shop QR to Check In</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cancel Queue Action */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancelQueue}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <Text style={styles.cancelBtnText}>Leave Queue / Cancel Ticket</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* QR Scanner Modal for Shop Check-In */}
      <QRScannerModal
        visible={scannerVisible}
        shopName={activeEntry.shop?.name || 'Barbershop'}
        onClose={() => setScannerVisible(false)}
        onCheckInSuccess={handleCheckInSuccess}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40
  },
  statusBanner: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16
  },
  statusWaiting: {
    backgroundColor: '#D97706'
  },
  statusInService: {
    backgroundColor: '#10B981'
  },
  statusBannerText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2
  },
  ticketCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center'
  },
  ticketLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.5
  },
  ticketNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: '#F59E0B',
    marginVertical: 4
  },
  shopTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  serviceSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4
  },
  estimateCard: {
    backgroundColor: '#0F172A',
    width: '100%',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    marginVertical: 20
  },
  estimateTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 1
  },
  estimateMinutes: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 6
  },
  peopleAheadText: {
    fontSize: 13,
    color: '#94A3B8'
  },
  disclaimerContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B'
  },
  disclaimerText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    fontStyle: 'italic'
  },
  checkInCard: {
    backgroundColor: '#0F172A',
    width: '100%',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20
  },
  checkInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  checkInTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  checkInSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    maxWidth: 180
  },
  checkInStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  badgeVerified: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)'
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)'
  },
  checkInStatusText: {
    fontSize: 10,
    fontWeight: '800'
  },
  textVerified: {
    color: '#10B981'
  },
  textPending: {
    color: '#F59E0B'
  },
  scanShopQrBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14
  },
  scanShopQrBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700'
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center'
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700'
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  emptyIcon: {
    fontSize: 36
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  exploreBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12
  },
  exploreBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800'
  }
});
