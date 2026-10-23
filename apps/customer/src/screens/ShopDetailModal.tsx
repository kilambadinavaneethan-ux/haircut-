import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import {
  Shop,
  Service,
  formatEstimatedWaitDisplay,
  getSupabaseClient
} from '@quickcut/shared';

interface ShopDetailModalProps {
  visible: boolean;
  shop: Shop | null;
  queueLength: number;
  estimatedWaitMinutes: number;
  customerId: string;
  hasActiveTicket?: boolean;
  activeTicketNumber?: number;
  activeShopName?: string;
  onClose: () => void;
  onJoinedQueueSuccess: (newEntryId: string) => void;
}

export function ShopDetailModal({
  visible,
  shop,
  queueLength,
  estimatedWaitMinutes,
  customerId,
  hasActiveTicket,
  activeTicketNumber,
  activeShopName,
  onClose,
  onJoinedQueueSuccess
}: ShopDetailModalProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [loadingServices, setLoadingServices] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  // Fetch shop's active services
  useEffect(() => {
    if (visible && shop) {
      setErrorMsg(null);
      setSelectedServiceId(null);
      fetchServices(shop.id);
    }
  }, [visible, shop]);

  const fetchServices = async (shopId: string) => {
    setLoadingServices(true);
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) throw error;
      const svcList = (data as unknown as Service[]) || [];
      setServices(svcList);
      if (svcList.length > 0) {
        setSelectedServiceId(svcList[0].id);
      }
    } catch (err: unknown) {
      console.warn('Failed to fetch services:', err);
      // Fallback sample services if empty database
      setServices([
        {
          id: '40000000-0000-0000-0000-000000000001',
          shop_id: shopId,
          name: 'Classic Haircut & Styling',
          price: 350,
          avg_minutes: 25,
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: '40000000-0000-0000-0000-000000000002',
          shop_id: shopId,
          name: 'Beard Sculpting & Hot Towel',
          price: 200,
          avg_minutes: 15,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ]);
      setSelectedServiceId('40000000-0000-0000-0000-000000000001');
    } finally {
      setLoadingServices(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!shop || !selectedServiceId) {
      Alert.alert('Selection Required', 'Please select a service.');
      return;
    }

    if (hasActiveTicket) {
      Alert.alert(
        'Active Ticket Exists',
        `You currently hold active ticket #${activeTicketNumber || ''} at ${activeShopName || 'another shop'}.\n\nUnder QuickCut policy, customers may only hold 1 active queue ticket at a time. Please leave or complete your current ticket first.`
      );
      return;
    }

    if (shop.is_queue_paused) {
      Alert.alert(
        'Queue Temporarily Paused',
        'This barber shop has temporarily paused accepting new entries. Please check back shortly.'
      );
      return;
    }

    setIsJoining(true);
    setErrorMsg(null);

    try {
      // Create queue entry in Supabase
      const { data, error } = await supabase
        .from('queue_entries')
        .insert({
          shop_id: shop.id,
          customer_id: customerId,
          service_id: selectedServiceId,
          status: 'waiting',
          is_walkin: false
        } as any)
        .select('id, queue_number')
        .single();

      if (error) throw error;
      const created = data as unknown as { id: string; queue_number: number };

      Alert.alert(
        'Queue Joined!',
        `Your queue number is #${created.queue_number}. Head to the Live Queue tab to track your position.`
      );
      onJoinedQueueSuccess(created.id);
      onClose();
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Could not join queue';
      if (message.includes('uq_active_customer_queue') || message.includes('duplicate')) {
        message = 'You already have an active queue ticket in progress.';
      }
      setErrorMsg(message);
      Alert.alert('Failed to Join Queue', message);
    } finally {
      setIsJoining(false);
    }
  };

  if (!shop) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Handle */}
          <View style={styles.dragHandle} />

          {/* Shop Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{shop.name}</Text>
              <Text style={styles.shopLocation}>{shop.address}</Text>
              <Text style={styles.shopHours}>
                Hours: {shop.opening_time.slice(0, 5)} - {shop.closing_time.slice(0, 5)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Queue Metrics & Estimated Wait Badge */}
          <View style={styles.waitBadgeRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>QUEUE LENGTH</Text>
              <Text style={styles.metricValue}>{queueLength} waiting</Text>
            </View>

            <View style={[styles.metricCard, styles.estimateMetricCard]}>
              <Text style={styles.estimateMetricLabel}>ESTIMATED WAIT</Text>
              <Text style={styles.estimateMetricValue}>
                {formatEstimatedWaitDisplay(estimatedWaitMinutes)}
              </Text>
              <Text style={styles.estimateDisclaimer}>
                * Estimate based on queue duration
              </Text>
            </View>
          </View>

          {errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Services Selection Section */}
          <Text style={styles.servicesHeader}>Select a Service:</Text>

          {loadingServices ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#F59E0B" />
              <Text style={styles.loadingText}>Loading shop services...</Text>
            </View>
          ) : (
            <ScrollView style={styles.servicesList} contentContainerStyle={{ paddingBottom: 16 }}>
              {services.map((svc) => {
                const isSelected = selectedServiceId === svc.id;
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
                    onPress={() => setSelectedServiceId(svc.id)}
                  >
                    <View style={styles.radioCircle}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.serviceName}>{svc.name}</Text>
                      <Text style={styles.serviceDuration}>~{svc.avg_minutes} mins duration</Text>
                    </View>
                    <Text style={styles.servicePrice}>₹{svc.price}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* CTA Join Queue */}
          <TouchableOpacity
            style={[
              styles.joinBtn,
              (shop.is_queue_paused || hasActiveTicket) && { backgroundColor: '#475569' }
            ]}
            onPress={handleJoinQueue}
            disabled={isJoining || loadingServices || !selectedServiceId || shop.is_queue_paused || hasActiveTicket}
          >
            {isJoining ? (
              <ActivityIndicator color="#0F172A" />
            ) : shop.is_queue_paused ? (
              <Text style={styles.joinBtnText}>⏸️ Queue Paused by Shop</Text>
            ) : hasActiveTicket ? (
              <Text style={styles.joinBtnText}>Active Ticket Already Held</Text>
            ) : (
              <Text style={styles.joinBtnText}>Join Live Queue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end'
  },
  sheetContainer: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: '#334155'
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#475569',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  shopName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  shopLocation: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  shopHours: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4
  },
  closeBtn: {
    padding: 6
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700'
  },
  waitBadgeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8'
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4
  },
  estimateMetricCard: {
    borderColor: '#F59E0B'
  },
  estimateMetricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B'
  },
  estimateMetricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F59E0B',
    marginTop: 4
  },
  estimateDisclaimer: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
    fontStyle: 'italic'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12
  },
  servicesHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 10
  },
  servicesList: {
    maxHeight: 220
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center'
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 8
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  serviceCardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.08)'
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B'
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  serviceDuration: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2
  },
  servicePrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F59E0B'
  },
  joinBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12
  },
  joinBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800'
  }
});
