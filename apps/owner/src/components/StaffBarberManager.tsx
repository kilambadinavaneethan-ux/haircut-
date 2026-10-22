import React, { useState } from 'react';
import { Barber, ShopStaff, getSupabaseClient } from '@quickcut/shared';

interface StaffBarberManagerProps {
  shopId: string;
  barbers: Barber[];
  staff: (ShopStaff & { profile?: { full_name: string; phone: string } })[];
  onReload: () => void;
}

export function StaffBarberManager({
  shopId,
  barbers,
  staff,
  onReload
}: StaffBarberManagerProps) {
  // New Barber state
  const [newBarberName, setNewBarberName] = useState('');
  const [addingBarber, setAddingBarber] = useState(false);

  // New Staff mapping state
  const [newStaffUserId, setNewStaffUserId] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('barber');
  const [addingStaff, setAddingStaff] = useState(false);

  const supabase = getSupabaseClient();

  // Add Barber
  const handleAddBarber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarberName.trim()) return;

    setAddingBarber(true);
    try {
      const { error } = await (supabase.from('barbers') as any).insert({
        shop_id: shopId,
        name: newBarberName.trim(),
        is_active: true
      });

      if (error) throw error;
      setNewBarberName('');
      onReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not add barber';
      alert(msg);
    } finally {
      setAddingBarber(false);
    }
  };

  // Toggle Barber Active
  const handleToggleBarber = async (barber: Barber) => {
    try {
      const { error } = await (supabase.from('barbers') as any)
        .update({ is_active: !barber.is_active })
        .eq('id', barber.id);

      if (error) throw error;
      onReload();
    } catch (err) {
      alert('Error updating barber status');
    }
  };

  // Delete Barber
  const handleDeleteBarber = async (barberId: string) => {
    if (!confirm('Remove this barber from your shop roster?')) return;
    try {
      const { error } = await (supabase.from('barbers') as any)
        .delete()
        .eq('id', barberId);

      if (error) throw error;
      onReload();
    } catch (err) {
      alert('Error removing barber');
    }
  };

  // Add Staff Member
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffUserId.trim()) return;

    setAddingStaff(true);
    try {
      const { error } = await (supabase.from('shop_staff') as any).insert({
        shop_id: shopId,
        user_id: newStaffUserId.trim(),
        role: newStaffRole
      });

      if (error) throw error;
      setNewStaffUserId('');
      alert('Staff member linked to shop successfully!');
      onReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not add staff';
      alert(msg);
    } finally {
      setAddingStaff(false);
    }
  };

  // Remove Staff
  const handleRemoveStaff = async (staffId: string) => {
    if (!confirm('Remove this staff member from your shop?')) return;
    try {
      const { error } = await (supabase.from('shop_staff') as any)
        .delete()
        .eq('id', staffId);

      if (error) throw error;
      onReload();
    } catch (err) {
      alert('Error removing staff');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* 1. Barbers / Chairs Roster */}
      <div className="glass-panel">
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
          Barbers & Chairs ({barbers.length})
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Manage barber chairs and active stylist availability for queue dispatch.
        </p>

        {/* Add Barber Form */}
        <form onSubmit={handleAddBarber} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            type="text"
            placeholder="Barber name (e.g. Leo Gomez)"
            value={newBarberName}
            onChange={(e) => setNewBarberName(e.target.value)}
            style={{ flex: 1 }}
            required
          />
          <button
            type="submit"
            disabled={addingBarber || !newBarberName.trim()}
            style={{
              background: 'var(--accent-gold)',
              color: '#0A0F1D',
              padding: '10px 16px',
              borderRadius: 8,
              fontWeight: 700
            }}
          >
            {addingBarber ? 'Adding...' : '+ Add Barber'}
          </button>
        </form>

        {/* Barbers List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {barbers.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0D1424',
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid var(--border-color)'
              }}
            >
              <div>
                <p style={{ fontWeight: 700, color: '#FFFFFF', fontSize: 14 }}>{b.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Station ID: {b.id.slice(0, 8)}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => handleToggleBarber(b)}
                  className={`badge ${b.is_active ? 'badge-approved' : 'badge-suspended'}`}
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  {b.is_active ? 'Active' : 'Off Duty'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBarber(b.id)}
                  style={{ background: 'transparent', color: 'var(--accent-red)', fontSize: 13, fontWeight: 600 }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {barbers.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
              No barbers added yet.
            </p>
          )}
        </div>
      </div>

      {/* 2. Staff Accounts */}
      <div className="glass-panel">
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
          Staff Accounts & Permissions ({staff.length})
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Link staff user IDs to this shop so they can operate the Staff mobile app.
        </p>

        {/* Add Staff Form */}
        <form onSubmit={handleAddStaff} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            type="text"
            placeholder="Staff User ID (UUID) or paste"
            value={newStaffUserId}
            onChange={(e) => setNewStaffUserId(e.target.value)}
            style={{ flex: 2 }}
            required
          />
          <select
            value={newStaffRole}
            onChange={(e) => setNewStaffRole(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="barber">Barber</option>
            <option value="manager">Manager</option>
            <option value="receptionist">Receptionist</option>
          </select>
          <button
            type="submit"
            disabled={addingStaff || !newStaffUserId.trim()}
            style={{
              background: 'var(--accent-blue)',
              color: '#0A0F1D',
              padding: '10px 16px',
              borderRadius: 8,
              fontWeight: 700
            }}
          >
            {addingStaff ? 'Linking...' : '+ Link Staff'}
          </button>
        </form>

        {/* Staff List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {staff.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0D1424',
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid var(--border-color)'
              }}
            >
              <div>
                <p style={{ fontWeight: 700, color: '#FFFFFF', fontSize: 14 }}>
                  {s.profile?.full_name || 'Staff Member'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Role: <strong style={{ color: 'var(--accent-blue)' }}>{s.role}</strong> • User ID: {s.user_id.slice(0, 8)}...
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveStaff(s.id)}
                style={{ background: 'transparent', color: 'var(--accent-red)', fontSize: 13, fontWeight: 600 }}
              >
                Unlink
              </button>
            </div>
          ))}

          {staff.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
              No staff accounts mapped to this shop yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
