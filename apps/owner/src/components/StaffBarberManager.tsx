import React, { useState } from 'react';
import { Barber, ShopStaff, Profile, getSupabaseClient, createIsolatedAuthClient } from '@quickcut/shared';

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

  // Create Staff Account (ID & Password) Modal State
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('Password123!');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState('barber');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    role: string;
  } | null>(null);

  const supabase = getSupabaseClient();

  // Create & Give Staff Account (ID & Password)
  const handleCreateStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffEmail.trim() || !staffPassword.trim()) {
      alert('Please fill in staff name, email, and password.');
      return;
    }

    setCreatingAccount(true);
    try {
      // 1. Isolated signup keeps owner logged in
      const isolatedAuth = createIsolatedAuthClient();
      const { data: authData, error: authErr } = await isolatedAuth.auth.signUp({
        email: staffEmail.trim(),
        password: staffPassword,
        options: {
          data: {
            full_name: staffName.trim(),
            role: 'staff',
            phone: staffPhone.trim() || null
          }
        }
      });

      if (authErr) throw authErr;

      const staffUserId = authData.user?.id || authData.session?.user?.id;
      if (!staffUserId) {
        throw new Error('Could not generate staff user ID.');
      }

      // 2. Profile upsert
      await (supabase.from('profiles') as any).upsert({
        id: staffUserId,
        role: 'staff',
        full_name: staffName.trim(),
        phone: staffPhone.trim() || null,
        updated_at: new Date().toISOString()
      });

      // 3. Link to shop_staff
      await (supabase.from('shop_staff') as any).upsert({
        shop_id: shopId,
        user_id: staffUserId,
        role: staffRole
      });

      // 4. Create barber chair
      await (supabase.from('barbers') as any).insert({
        shop_id: shopId,
        user_id: staffUserId,
        name: staffName.trim(),
        is_active: true
      });

      setIssuedCredentials({
        name: staffName.trim(),
        email: staffEmail.trim(),
        password: staffPassword,
        role: staffRole
      });

      setStaffName('');
      setStaffEmail('');
      setStaffPassword('Password123!');
      setStaffPhone('');
      setCreateAccountModalOpen(false);
      onReload();
    } catch (err: any) {
      alert(`Staff Account Creation Failed: ${err.message}`);
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleAutofillDemo = () => {
    const suffix = Math.floor(100 + Math.random() * 900);
    setStaffName(`Barber Staff ${suffix}`);
    setStaffEmail(`staff.barber${suffix}@quickcut.com`);
    setStaffPassword('Password123!');
    setStaffPhone('+91 97777 33333');
    setStaffRole('barber');
  };

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              Staff Accounts & Permissions ({staff.length})
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Create barber login credentials or link existing staff accounts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateAccountModalOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + Give Staff Account (ID & Password)
          </button>
        </div>

        {/* Add Staff Form (Direct UUID link) */}
        <form onSubmit={handleAddStaff} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            type="text"
            placeholder="Link by User ID (UUID) or paste"
            value={newStaffUserId}
            onChange={(e) => setNewStaffUserId(e.target.value)}
            style={{ flex: 2 }}
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
              No staff accounts mapped to this shop yet. Click &quot;+ Give Staff Account&quot; to create one.
            </p>
          )}
        </div>
      </div>

      {/* Modal: Create Staff Account (ID & Password) */}
      {createAccountModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#0D1424',
              borderRadius: 14,
              padding: 24,
              border: '1px solid var(--border-color)'
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>
              Give Staff Account (ID & Password)
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Create barber login credentials so your staff can log into the QuickCut Staff App.
            </p>

            <form onSubmit={handleCreateStaffAccount}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#CBD5E1' }}>
                  Staff Barber Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sam Wilson"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#CBD5E1' }}>
                  Staff Login ID (Email) *
                </label>
                <input
                  type="email"
                  placeholder="staff.sam@quickcut.com"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#CBD5E1' }}>
                  Staff Password *
                </label>
                <input
                  type="text"
                  placeholder="Password123!"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#CBD5E1' }}>
                  Staff Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="+91 97777 33333"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#CBD5E1' }}>
                  Role / Position
                </label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="barber">Barber</option>
                  <option value="senior_barber">Senior Stylist</option>
                  <option value="manager">Shop Manager</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={handleAutofillDemo}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--accent-blue)',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  ⚡ Autofill Demo Staff (staff.barber@quickcut.com)
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setCreateAccountModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    padding: '8px 16px',
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                  disabled={creatingAccount}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAccount}
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {creatingAccount ? 'Provisioning...' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Issued Credentials Receipt */}
      {issuedCredentials && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100,
            padding: 20
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#0D1424',
              borderRadius: 14,
              padding: 24,
              border: '1px solid #10B981'
            }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#10B981', textAlign: 'center', marginBottom: 6 }}>
              🎉 Staff Account Created!
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 16 }}>
              Give these credentials to your staff barber so they can log into the QuickCut Staff App:
            </p>

            <div style={{ background: '#050A14', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border-color)' }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>STAFF NAME:</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', margin: '2px 0 0 0' }}>{issuedCredentials.name}</p>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>STAFF LOGIN ID (EMAIL):</span>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-blue)', margin: '2px 0 0 0' }}>{issuedCredentials.email}</p>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>STAFF PASSWORD:</span>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-blue)', margin: '2px 0 0 0' }}>{issuedCredentials.password}</p>
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>ROLE:</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#CBD5E1', margin: '2px 0 0 0' }}>{issuedCredentials.role.toUpperCase()}</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
