import React, { useState } from 'react';
import type { Shop, Profile } from '@quickcut/shared';
import { logAdminAction } from '../utils/adminAudit';
import { getSupabaseClient } from '@quickcut/shared';

interface ShopManagementProps {
  adminId: string;
  shops: Shop[];
  profiles: Profile[];
  onShopUpdated: (updatedShop: Shop) => void;
}

export default function ShopManagement({
  adminId,
  shops,
  profiles,
  onShopUpdated
}: ShopManagementProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionTarget, setActionTarget] = useState<{ shop: Shop; nextStatus: Shop['status'] } | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = getSupabaseClient();

  const getOwnerName = (ownerId: string) => {
    const owner = profiles.find((p) => p.id === ownerId);
    return owner ? owner.full_name : 'Unknown Owner';
  };

  const getOwnerPhone = (ownerId: string) => {
    const owner = profiles.find((p) => p.id === ownerId);
    return owner?.phone || 'N/A';
  };

  const filteredShops = shops.filter((s) => {
    const matchesFilter = filter === 'all' || s.status === filter;
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getOwnerName(s.owner_id).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const confirmStatusChange = async () => {
    if (!actionTarget) return;
    const { shop, nextStatus } = actionTarget;
    setLoading(true);

    try {
      const { error } = await (supabase.from('shops') as any)
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', shop.id);

      if (error) throw error;

      // Log administrative action
      await logAdminAction(adminId, `SHOP_${nextStatus.toUpperCase()}`, 'shops', shop.id, {
        shop_name: shop.name,
        previous_status: shop.status,
        new_status: nextStatus,
        reason: actionReason || 'Admin console action'
      });

      onShopUpdated({
        ...shop,
        status: nextStatus,
        updated_at: new Date().toISOString()
      });

      setActionTarget(null);
      setActionReason('');
    } catch (err: any) {
      alert(`Failed to update shop status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Top Header & Search Bar */}
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
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Barber Shop Approvals & Oversight</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Approve incoming shops, enforce quality guidelines, or suspend delinquent partners.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by shop, owner or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 280 }}
          />

          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-color)' }}>
            {(['all', 'pending', 'approved', 'suspended'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  background: filter === tab ? 'var(--accent-indigo)' : 'transparent',
                  color: filter === tab ? '#FFFFFF' : 'var(--text-secondary)'
                }}
              >
                {tab} ({tab === 'all' ? shops.length : shops.filter((s) => s.status === tab).length})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Shops Table */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Shop Name & Owner</th>
                <th>Address & Location</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Submitted</th>
                <th style={{ textAlign: 'right' }}>Administrative Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No shops match the selected filter or search query.
                  </td>
                </tr>
              ) : (
                filteredShops.map((shop) => (
                  <tr key={shop.id}>
                    <td>
                      <div style={{ fontWeight: 800, color: '#FFFFFF', fontSize: 14 }}>{shop.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Owner: {getOwnerName(shop.owner_id)} • Phone: {shop.phone || getOwnerPhone(shop.owner_id)}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      <div>{shop.address}</div>
                      {shop.latitude && shop.longitude && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          GPS: {shop.latitude.toFixed(4)}, {shop.longitude.toFixed(4)}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {shop.opening_time.slice(0, 5)} - {shop.closing_time.slice(0, 5)}
                    </td>
                    <td>
                      <span className={`badge badge-${shop.status}`}>{shop.status}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(shop.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {shop.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setActionTarget({ shop, nextStatus: 'approved' })}
                              style={{
                                background: 'var(--accent-green)',
                                color: '#070A13',
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontWeight: 800,
                                fontSize: 12
                              }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => setActionTarget({ shop, nextStatus: 'suspended' })}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--accent-rose)',
                                color: 'var(--accent-rose)',
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontWeight: 700,
                                fontSize: 12
                              }}
                            >
                              ✕ Reject
                            </button>
                          </>
                        )}

                        {shop.status === 'approved' && (
                          <button
                            onClick={() => setActionTarget({ shop, nextStatus: 'suspended' })}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--accent-rose)',
                              color: 'var(--accent-rose)',
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            Suspend Shop
                          </button>
                        )}

                        {shop.status === 'suspended' && (
                          <button
                            onClick={() => setActionTarget({ shop, nextStatus: 'approved' })}
                            style={{
                              background: 'var(--accent-indigo)',
                              color: '#FFFFFF',
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            Reinstate
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedShop(shop)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: 'var(--text-secondary)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {actionTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
              Confirm Status Change: {actionTarget.nextStatus.toUpperCase()}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              You are about to change the status of <strong>{actionTarget.shop.name}</strong> to{' '}
              <span className={`badge badge-${actionTarget.nextStatus}`}>{actionTarget.nextStatus}</span>.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                Reason / Internal Administrative Note (Recorded to Audit Trail)
              </label>
              <textarea
                rows={3}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="e.g. Verified license & location, or delinquent payment settlement pending..."
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                disabled={loading}
                onClick={() => {
                  setActionTarget(null);
                  setActionReason('');
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                disabled={loading}
                onClick={confirmStatusChange}
                style={{
                  background:
                    actionTarget.nextStatus === 'approved' ? 'var(--accent-green)' : 'var(--accent-rose)',
                  color: actionTarget.nextStatus === 'approved' ? '#070A13' : '#FFFFFF',
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontWeight: 800
                }}
              >
                {loading ? 'Executing...' : `Confirm ${actionTarget.nextStatus.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shop Details Modal */}
      {selectedShop && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>Shop Overview</h3>
              <button
                onClick={() => setSelectedShop(null)}
                style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Shop ID:</span>{' '}
                <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{selectedShop.id}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Name:</span>{' '}
                <strong>{selectedShop.name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Address:</span> {selectedShop.address}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Owner:</span>{' '}
                <strong>{getOwnerName(selectedShop.owner_id)}</strong> ({getOwnerPhone(selectedShop.owner_id)})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Hours:</span> {selectedShop.opening_time} - {selectedShop.closing_time}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>{' '}
                <span className={`badge badge-${selectedShop.status}`}>{selectedShop.status}</span>
              </div>
            </div>

            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <button
                onClick={() => setSelectedShop(null)}
                style={{
                  background: 'var(--accent-indigo)',
                  color: '#FFFFFF',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontWeight: 700
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
