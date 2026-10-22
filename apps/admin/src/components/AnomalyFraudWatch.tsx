import React, { useState } from 'react';
import type { QueueEntry, Shop, Profile } from '@quickcut/shared';
import { logAdminAction } from '../utils/adminAudit';
import { getSupabaseClient } from '@quickcut/shared';

interface FlaggedAnomaly {
  id: string;
  entry: QueueEntry;
  shopName: string;
  patternType: 'RAPID_COMPLETION' | 'BURST_COMPLETION' | 'INVARIANT_VIOLATION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  durationSeconds?: number;
}

interface AnomalyFraudWatchProps {
  adminId: string;
  shops: Shop[];
  queueEntries: QueueEntry[];
  profiles: Profile[];
  onQueueEntryUpdated: (updatedEntry: QueueEntry) => void;
  onSuspendShopRequest: (shopId: string) => void;
}

export default function AnomalyFraudWatch({
  adminId,
  shops,
  queueEntries,
  profiles,
  onQueueEntryUpdated,
  onSuspendShopRequest
}: AnomalyFraudWatchProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const getShopName = (shopId: string) => {
    const s = shops.find((item) => item.id === shopId);
    return s ? s.name : 'Unknown Shop';
  };

  const getCustomerName = (entry: QueueEntry) => {
    if (entry.guest_name) return `${entry.guest_name} (Walk-in)`;
    if (entry.customer_id) {
      const p = profiles.find((item) => item.id === entry.customer_id);
      return p ? p.full_name : 'Registered Customer';
    }
    return 'Customer';
  };

  // Anomaly Detection Algorithm
  const detectAnomalies = (): FlaggedAnomaly[] => {
    const anomalies: FlaggedAnomaly[] = [];
    const completed = queueEntries.filter((e) => e.status === 'completed');

    // 1. Rapid Completion Detection (< 60s from check-in to completion)
    for (const entry of completed) {
      if (entry.checked_in_at && entry.completed_at) {
        const checkIn = new Date(entry.checked_in_at).getTime();
        const complete = new Date(entry.completed_at).getTime();
        const durationSec = Math.round((complete - checkIn) / 1000);

        if (durationSec < 60 && durationSec >= 0) {
          anomalies.push({
            id: `rapid-${entry.id}`,
            entry,
            shopName: getShopName(entry.shop_id),
            patternType: 'RAPID_COMPLETION',
            severity: 'CRITICAL',
            durationSeconds: durationSec,
            description: `Completed only ${durationSec}s after QR check-in. Unrealistic haircut duration indicates artificial billing inflation.`
          });
        }
      }

      // 2. Invariant Check: Billable marked true without QR check-in
      if (entry.is_billable && !entry.checked_in_at) {
        anomalies.push({
          id: `invariant-${entry.id}`,
          entry,
          shopName: getShopName(entry.shop_id),
          patternType: 'INVARIANT_VIOLATION',
          severity: 'CRITICAL',
          description: 'Entry marked billable without customer QR check-in timestamp. Violates core platform billing invariant.'
        });
      }
    }

    // 3. Burst Completion Detection: multiple completions within 120s by same shop
    const sortedByTime = [...completed].sort(
      (a, b) => new Date(a.completed_at || a.updated_at).getTime() - new Date(b.completed_at || b.updated_at).getTime()
    );

    for (let i = 0; i < sortedByTime.length - 1; i++) {
      const cur = sortedByTime[i];
      const next = sortedByTime[i + 1];

      if (cur.shop_id === next.shop_id && cur.completed_at && next.completed_at) {
        const t1 = new Date(cur.completed_at).getTime();
        const t2 = new Date(next.completed_at).getTime();
        const diffSec = Math.round((t2 - t1) / 1000);

        if (diffSec < 45 && diffSec >= 0 && !anomalies.some((a) => a.entry.id === next.id)) {
          anomalies.push({
            id: `burst-${next.id}`,
            entry: next,
            shopName: getShopName(next.shop_id),
            patternType: 'BURST_COMPLETION',
            severity: 'HIGH',
            durationSeconds: diffSec,
            description: `Consecutive haircut completed within ${diffSec}s of previous service at same shop.`
          });
        }
      }
    }

    // If no real anomalies found in current seed, generate a sample demonstrator so admin can test review flow
    if (anomalies.length === 0 && queueEntries.length > 0) {
      const sample = queueEntries.find((e) => e.status === 'completed') || queueEntries[0];
      anomalies.push({
        id: `demo-rapid-${sample.id}`,
        entry: sample,
        shopName: getShopName(sample.shop_id),
        patternType: 'RAPID_COMPLETION',
        severity: 'HIGH',
        durationSeconds: 24,
        description: 'Simulated Anomaly: Customer marked completed 24s after seating. Review for potential staff batch-closing tickets.'
      });
    }

    return anomalies.filter((a) => !dismissedIds.includes(a.id));
  };

  const flaggedList = detectAnomalies();

  const handleInvalidateBillable = async (anomaly: FlaggedAnomaly) => {
    setLoadingId(anomaly.id);
    try {
      const { error } = await (supabase.from('queue_entries') as any)
        .update({
          is_billable: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', anomaly.entry.id);

      if (error) throw error;

      await logAdminAction(adminId, 'FRAUD_ENTRY_INVALIDATED', 'queue_entries', anomaly.entry.id, {
        shop_name: anomaly.shopName,
        pattern_type: anomaly.patternType,
        reason: anomaly.description
      });

      onQueueEntryUpdated({
        ...anomaly.entry,
        is_billable: false,
        updated_at: new Date().toISOString()
      });

      setDismissedIds((prev) => [...prev, anomaly.id]);
    } catch (err: any) {
      alert(`Failed to invalidate entry: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (anomaly: FlaggedAnomaly) => {
    setDismissedIds((prev) => [...prev, anomaly.id]);
    await logAdminAction(adminId, 'FRAUD_FLAG_DISMISSED', 'queue_entries', anomaly.entry.id, {
      shop_name: anomaly.shopName,
      reviewed_by: adminId,
      reason: 'Admin marked legitimate after review'
    });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Fraud & Anomaly Watchdog</h2>
          <span
            style={{
              background: flaggedList.length > 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: flaggedList.length > 0 ? 'var(--accent-rose)' : 'var(--accent-green)',
              padding: '2px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 800
            }}
          >
            {flaggedList.length} Anomaly Alerts
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
          Algorithmic heuristics detect rapid-fire ticket completions, suspicious duration times, and billing inflation patterns.
        </p>
      </div>

      {/* Flagged Anomalies Grid */}
      {flaggedList.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-green)' }}>
            All Platform Traffic Within Normal Parameters
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 500, margin: '6px auto 0' }}>
            No anomalous completions under 60 seconds or rapid burst tickets detected across active shops.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {flaggedList.map((anomaly) => (
            <div
              key={anomaly.id}
              className="glass-panel"
              style={{
                borderLeft: `4px solid ${
                  anomaly.severity === 'CRITICAL' ? 'var(--accent-rose)' : 'var(--accent-amber)'
                }`
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        background:
                          anomaly.severity === 'CRITICAL' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: anomaly.severity === 'CRITICAL' ? 'var(--accent-rose)' : 'var(--accent-amber)',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 800
                      }}
                    >
                      {anomaly.severity} ALERT
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>
                      {anomaly.patternType.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Ticket #{anomaly.entry.queue_number}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 16, fontWeight: 800 }}>{anomaly.shopName}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Customer: {getCustomerName(anomaly.entry)} • Current Status:{' '}
                    <span className={`badge badge-${anomaly.entry.status}`}>{anomaly.entry.status}</span> •
                    Billable: {anomaly.entry.is_billable ? '₹5.00 INR' : 'Exempt'}
                  </p>

                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginTop: 10,
                      border: '1px solid var(--border-color)',
                      fontSize: 13,
                      color: '#FCA5A5'
                    }}
                  >
                    ⚠️ {anomaly.description}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {anomaly.entry.is_billable && (
                    <button
                      disabled={loadingId === anomaly.id}
                      onClick={() => handleInvalidateBillable(anomaly)}
                      style={{
                        background: 'var(--accent-rose)',
                        color: '#FFFFFF',
                        padding: '8px 14px',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 12
                      }}
                    >
                      {loadingId === anomaly.id ? 'Updating...' : 'Invalidate Billable (₹0)'}
                    </button>
                  )}

                  <button
                    onClick={() => onSuspendShopRequest(anomaly.entry.shop_id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--accent-rose)',
                      color: 'var(--accent-rose)',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 12
                    }}
                  >
                    Suspend Shop
                  </button>

                  <button
                    onClick={() => handleDismiss(anomaly)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-secondary)',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    Dismiss Flag
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
