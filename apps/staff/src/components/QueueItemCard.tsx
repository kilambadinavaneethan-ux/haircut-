import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity
} from 'react-native';
import { QueueEntryWithDetails } from '@quickcut/shared';

interface QueueItemCardProps {
  entry: QueueEntryWithDetails;
  isNextUp: boolean;
  isInChair: boolean;
  onStartService: (entry: QueueEntryWithDetails) => void;
  onCompleteService: (entry: QueueEntryWithDetails) => void;
  onMarkCancelled: (entry: QueueEntryWithDetails) => void;
  onMarkNoShow: (entry: QueueEntryWithDetails) => void;
  onOpenQRCheckIn: (entry: QueueEntryWithDetails) => void;
}

export function QueueItemCard({
  entry,
  isNextUp,
  isInChair,
  onStartService,
  onCompleteService,
  onMarkCancelled,
  onMarkNoShow,
  onOpenQRCheckIn
}: QueueItemCardProps) {
  const isCheckedIn = !!entry.checked_in_at;
  const isOnlineCustomer = !entry.is_walkin;
  const showBillingWarning = isOnlineCustomer && !isCheckedIn;

  return (
    <View
      style={[
        styles.card,
        isNextUp && styles.cardNextUp,
        isInChair && styles.cardInChair
      ]}
    >
      {/* "Next Up" or "Currently In Chair" Tag */}
      {isInChair ? (
        <View style={styles.inChairBanner}>
          <Text style={styles.inChairBannerText}>✂️ CURRENTLY IN CHAIR</Text>
        </View>
      ) : isNextUp ? (
        <View style={styles.nextUpBanner}>
          <Text style={styles.nextUpBannerText}>★ NEXT IN LINE</Text>
        </View>
      ) : null}

      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>#{entry.queue_number}</Text>
        </View>

        <View style={styles.guestInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.guestName}>{entry.guest_name || 'App Customer'}</Text>
            {entry.is_walkin && (
              <View style={styles.walkinPill}>
                <Text style={styles.walkinPillText}>WALK-IN</Text>
              </View>
            )}
          </View>
          <Text style={styles.serviceName}>
            {entry.service?.name} (~{entry.service?.avg_minutes || 20}m) • ₹{entry.service?.price || 0}
          </Text>
        </View>

        {/* QR Check-in Badge button */}
        <TouchableOpacity
          style={[
            styles.qrBadge,
            isCheckedIn ? styles.qrBadgeVerified : styles.qrBadgePending
          ]}
          onPress={() => onOpenQRCheckIn(entry)}
        >
          <Text style={styles.qrBadgeText}>
            {isCheckedIn ? '✓ QR Verified' : 'Scan QR'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Prominent Billing Invariant Warning for online bookings without QR arrival */}
      {showBillingWarning && (
        <View style={styles.billingWarningBox}>
          <Text style={styles.billingWarningTitle}>⚠️ Non-Checked-In Booking Warning</Text>
          <Text style={styles.billingWarningDesc}>
            Customer has NOT scanned QR check-in. Under platform rules, completing this service will <Text style={{ fontWeight: '800' }}>NOT count for platform billing</Text>.
          </Text>
        </View>
      )}

      {/* Large Easy Action Buttons for Fast Barber Operations */}
      <View style={styles.actionSection}>
        {isInChair ? (
          /* Chair is active -> large Complete button */
          <TouchableOpacity
            style={styles.completeBtnLarge}
            onPress={() => onCompleteService(entry)}
          >
            <Text style={styles.completeBtnText}>✓ Complete Service</Text>
          </TouchableOpacity>
        ) : (
          /* Waiting -> Start service button + Quick cancel / no-show */
          <View style={styles.buttonsColumn}>
            <TouchableOpacity
              style={[styles.startBtnLarge, isNextUp && styles.startBtnNextUp]}
              onPress={() => onStartService(entry)}
            >
              <Text style={styles.startBtnText}>▶ Seat Customer / Start Service</Text>
            </TouchableOpacity>

            <View style={styles.secondaryActionsRow}>
              {!isCheckedIn && isOnlineCustomer && (
                <TouchableOpacity
                  style={styles.verifyQrActionBtn}
                  onPress={() => onOpenQRCheckIn(entry)}
                >
                  <Text style={styles.verifyQrActionText}>📷 Verify QR Pass</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.noShowBtn}
                onPress={() => onMarkNoShow(entry)}
              >
                <Text style={styles.noShowBtnText}>No-Show</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => onMarkCancelled(entry)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden'
  },
  cardNextUp: {
    borderColor: '#F59E0B',
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.05)'
  },
  cardInChair: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.05)'
  },
  nextUpBanner: {
    backgroundColor: '#F59E0B',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10
  },
  nextUpBannerText: {
    color: '#090D16',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1
  },
  inChairBanner: {
    backgroundColor: '#10B981',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10
  },
  inChairBannerText: {
    color: '#090D16',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  numberBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54
  },
  numberText: {
    color: '#38BDF8',
    fontSize: 18,
    fontWeight: '900'
  },
  guestInfo: {
    flex: 1,
    marginLeft: 12
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  guestName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  walkinPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  walkinPillText: {
    fontSize: 9,
    color: '#38BDF8',
    fontWeight: '800'
  },
  serviceName: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  qrBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  qrBadgeVerified: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981'
  },
  qrBadgePending: {
    backgroundColor: '#F59E0B'
  },
  qrBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  billingWarningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 10,
    marginTop: 12
  },
  billingWarningTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800'
  },
  billingWarningDesc: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16
  },
  actionSection: {
    marginTop: 14
  },
  buttonsColumn: {
    gap: 8
  },
  startBtnLarge: {
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  startBtnNextUp: {
    backgroundColor: '#F59E0B'
  },
  startBtnText: {
    color: '#090D16',
    fontWeight: '800',
    fontSize: 15
  },
  completeBtnLarge: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  completeBtnText: {
    color: '#090D16',
    fontWeight: '900',
    fontSize: 16
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  verifyQrActionBtn: {
    flex: 2,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8'
  },
  verifyQrActionText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700'
  },
  noShowBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF4444'
  },
  noShowBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700'
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#64748B'
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700'
  }
});
