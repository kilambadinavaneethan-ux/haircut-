import React, { useState } from 'react';
import type { QueueEntry, Shop, Service, Profile } from '@quickcut/shared';

interface PlatformActivityProps {
  shops: Shop[];
  queueEntries: QueueEntry[];
  services: Service[];
  profiles: Profile[];
  realtimeConnected: boolean;
}

export default function PlatformActivity({
  shops,
  queueEntries,
  services,
  profiles,
  realtimeConnected
}: PlatformActivityProps) {
  const [activeSubTab, setActiveSubTab] = useState<'live_queues' | 'completed'>('live_queues');
  const [selectedShopId, setSelectedShopId] = useState<string>('all');

  const getShopName = (shopId: string) => {
    const s = shops.find((item) => item.id === shopId);
    return s ? s.name : 'Unknown Shop';
  };

  const getServiceName = (serviceId: string) => {
    const s = services.find((item) => item.id === serviceId);
    return s ? s.name : 'Haircut Service';
  };

  const getCustomerName = (entry: QueueEntry) => {
    if (entry.guest_name) return `${entry.guest_name} (Walk-in)`;
    if (entry.customer_id) {
      const p = profiles.find((item) => item.id === entry.customer_id);
      return p ? p.full_name : 'Registered Customer';
    }
    return 'Customer';
  };

  const liveEntries = queueEntries.filter(
    (e) => (e.status === 'waiting' || e.status === 'in_service') &&
      (selectedShopId === 'all' || e.shop_id === selectedShopId)
  );

  const completedEntries = queueEntries
    .filter(
      (e) => e.status === 'completed' &&
        (selectedShopId === 'all' || e.shop_id === selectedShopId)
    )
    .sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime());

  const activeShopsCount = shops.filter((s) => s.status === 'approved').length;

  return (
    <div>
      {/* Top Banner and Realtime Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Global Platform Activity</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Live queue traffic, ongoing chair sessions, and completed cuts across all active salons.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Realtime indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--accent-green)'
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: realtimeConnected ? 'var(--accent-green)' : 'var(--accent-amber)',
                boxShadow: realtimeConnected ? '0 0 8px var(--accent-green)' : 'none'
              }}
            />
            {realtimeConnected ? 'Supabase Realtime Active' : 'Connecting to Stream...'}
          </div>

          {/* Shop filter dropdown */}
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="all">All Barber Shops ({shops.length})</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mini Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="glass-panel" style={{ padding: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>APPROVED / ACTIVE SHOPS</p>
          <p style={{ fontSize: 24, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>
            {activeShopsCount} <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>/ {shops.length} total</span>
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>CUSTOMERS IN QUEUE / CHAIR</p>
          <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent-blue)', marginTop: 4 }}>
            {liveEntries.length}
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>COMPLETED CUTS TODAY</p>
          <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent-green)', marginTop: 4 }}>
            {completedEntries.length}
          </p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
        <button
          onClick={() => setActiveSubTab('live_queues')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            background: activeSubTab === 'live_queues' ? 'var(--accent-indigo)' : 'transparent',
            color: activeSubTab === 'live_queues' ? '#FFFFFF' : 'var(--text-secondary)',
            border: activeSubTab === 'live_queues' ? 'none' : '1px solid var(--border-color)'
          }}
        >
          Live Queues & In-Service ({liveEntries.length})
        </button>
        <button
          onClick={() => setActiveSubTab('completed')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            background: activeSubTab === 'completed' ? 'var(--accent-indigo)' : 'transparent',
            color: activeSubTab === 'completed' ? '#FFFFFF' : 'var(--text-secondary)',
            border: activeSubTab === 'completed' ? 'none' : '1px solid var(--border-color)'
          }}
        >
          Completed Services Stream ({completedEntries.length})
        </button>
      </div>

      {/* Live Queues View */}
      {activeSubTab === 'live_queues' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Shop</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>QR Check-in</th>
                  <th>Joined At</th>
                </tr>
              </thead>
              <tbody>
                {liveEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No active customers currently waiting in queue or in chair.
                    </td>
                  </tr>
                ) : (
                  liveEntries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 800, color: 'var(--accent-indigo)', fontSize: 15 }}>
                        #{e.queue_number}
                      </td>
                      <td style={{ fontWeight: 700, color: '#FFFFFF' }}>{getShopName(e.shop_id)}</td>
                      <td style={{ color: 'var(--text-primary)' }}>{getCustomerName(e)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{getServiceName(e.service_id)}</td>
                      <td>
                        <span className={`badge badge-${e.status}`}>{e.status.replace('_', ' ')}</span>
                      </td>
                      <td>
                        {e.checked_in_at ? (
                          <span style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: 12 }}>
                            ✓ Verified ({new Date(e.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--accent-amber)', fontSize: 12 }}>
                            ⏳ Not Checked In
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed Services Stream */}
      {activeSubTab === 'completed' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Shop</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>QR Check-in</th>
                  <th>Billable (₹5 Fee)</th>
                  <th>Completed Time</th>
                </tr>
              </thead>
              <tbody>
                {completedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No completed services recorded yet.
                    </td>
                  </tr>
                ) : (
                  completedEntries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 800, color: '#FFFFFF' }}>#{e.queue_number}</td>
                      <td style={{ fontWeight: 700 }}>{getShopName(e.shop_id)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{getCustomerName(e)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{getServiceName(e.service_id)}</td>
                      <td>
                        {e.checked_in_at ? (
                          <span style={{ color: 'var(--accent-green)', fontSize: 12, fontWeight: 700 }}>
                            ✓ QR Verified
                          </span>
                        ) : (
                          <span style={{ color: 'var(--accent-rose)', fontSize: 12 }}>✕ Unverified</span>
                        )}
                      </td>
                      <td>
                        {e.is_billable ? (
                          <span className="badge badge-paid">₹5.00 Billable</span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                            {e.is_walkin ? 'Walk-in (Exempt)' : 'Exempt'}
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {e.completed_at ? new Date(e.completed_at).toLocaleString() : new Date(e.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
