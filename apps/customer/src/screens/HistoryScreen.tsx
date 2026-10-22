import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity
} from 'react-native';
import { QueueEntryWithDetails, getSupabaseClient } from '@quickcut/shared';

interface HistoryScreenProps {
  customerId: string;
}

function getStatusBadgeStyle(status: string) {
  switch (status) {
    case 'completed':
      return styles.status_completed;
    case 'cancelled':
      return styles.status_cancelled;
    case 'no_show':
      return styles.status_no_show;
    default:
      return styles.status_default;
  }
}

export function HistoryScreen({ customerId }: HistoryScreenProps) {
  const [history, setHistory] = useState<QueueEntryWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const supabase = getSupabaseClient();

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('queue_entries')
        .select(`
          id,
          queue_number,
          status,
          checked_in_at,
          completed_at,
          created_at,
          shop:shops(name, address),
          service:services(name, price)
        `)
        .eq('customer_id', customerId)
        .in('status', ['completed', 'cancelled', 'no_show'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory((data as unknown as QueueEntryWithDetails[]) || []);
    } catch (err) {
      console.warn('Error fetching queue history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [customerId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.loadingText}>Loading queue history...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
    >
      <Text style={styles.screenTitle}>Queue History</Text>
      <Text style={styles.screenSubtitle}>Your past barber shop visits and queue tickets</Text>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Past Visits</Text>
          <Text style={styles.emptyText}>Completed or cancelled queue tickets will show up here.</Text>
        </View>
      ) : (
        history.map((entry) => (
          <View key={entry.id} style={styles.historyCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.shopName}>{entry.shop?.name || 'Barbershop'}</Text>
                <Text style={styles.ticketNum}>Ticket #{entry.queue_number}</Text>
              </View>
              <View style={[styles.statusBadge, getStatusBadgeStyle(entry.status)]}>
                <Text style={styles.statusBadgeText}>{entry.status.replace('_', ' ').toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.serviceRow}>
              <Text style={styles.serviceText}>{entry.service?.name}</Text>
              <Text style={styles.priceText}>₹{entry.service?.price}</Text>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>
                {new Date(entry.created_at).toLocaleDateString()} •{' '}
                {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {entry.checked_in_at && (
                <Text style={styles.checkedInTag}>✓ QR Checked In</Text>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
    marginBottom: 16
  },
  emptyState: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 20
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center'
  },
  historyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  shopName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  ticketNum: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '700',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  status_completed: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)'
  },
  status_cancelled: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)'
  },
  status_no_show: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)'
  },
  status_default: {
    backgroundColor: '#334155'
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4
  },
  serviceText: {
    fontSize: 14,
    color: '#CBD5E1'
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155'
  },
  dateText: {
    fontSize: 12,
    color: '#64748B'
  },
  checkedInTag: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600'
  }
});
