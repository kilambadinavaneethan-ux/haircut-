import React, { useState } from 'react';
import type { Profile } from '@quickcut/shared';
import { logAdminAction } from '../utils/adminAudit';
import { getSupabaseClient } from '@quickcut/shared';

interface AccountManagementProps {
  adminId: string;
  profiles: Profile[];
  onProfileUpdated: (updatedProfile: Profile) => void;
}

export default function AccountManagement({
  adminId,
  profiles,
  onProfileUpdated
}: AccountManagementProps) {
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'owner' | 'staff' | 'admin'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [selectedRole, setSelectedRole] = useState<Profile['role']>('customer');
  const [loading, setLoading] = useState(false);

  // Create Account Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRole, setNewRole] = useState<Profile['role']>('staff');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('Password123!');
  const [creating, setCreating] = useState(false);

  const supabase = getSupabaseClient();

  const filteredProfiles = profiles.filter((p) => {
    const matchesFilter = roleFilter === 'all' || p.role === roleFilter;
    const matchesSearch =
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleOpenEdit = (profile: Profile) => {
    setEditingProfile(profile);
    setSelectedRole(profile.role);
  };

  const handleSaveRole = async () => {
    if (!editingProfile) return;
    setLoading(true);

    try {
      // 1. Execute secure admin role RPC
      const { error: rpcError } = await (supabase.rpc as any)('admin_set_user_role', {
        p_user_id: editingProfile.id,
        p_new_role: selectedRole
      });

      if (rpcError) {
        // Fallback update
        const { error } = await (supabase.from('profiles') as any)
          .update({
            role: selectedRole,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingProfile.id);

        if (error) throw error;
      }

      await logAdminAction(adminId, 'PROFILE_ROLE_UPDATED', 'profiles', editingProfile.id, {
        user_name: editingProfile.full_name,
        previous_role: editingProfile.role,
        new_role: selectedRole
      });

      const updated = {
        ...editingProfile,
        role: selectedRole,
        updated_at: new Date().toISOString()
      };

      onProfileUpdated(updated);
      setEditingProfile(null);
    } catch (err: any) {
      alert(`Failed to update account role: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      alert('Please fill in Name, Email, and Password.');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newEmail.trim(),
        password: newPassword,
        options: {
          data: {
            full_name: newName.trim(),
            phone: newPhone.trim() || null,
            role: newRole
          }
        }
      });

      if (error) throw error;

      const newId = data.user?.id || data.session?.user?.id;
      if (newId) {
        const newProfile: Profile = {
          id: newId,
          role: newRole,
          full_name: newName.trim(),
          phone: newPhone.trim() || null,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await (supabase.from('profiles') as any).upsert(newProfile);

        await logAdminAction(adminId, 'ACCOUNT_PROVISIONED_BY_ADMIN', 'profiles', newId, {
          user_name: newName.trim(),
          email: newEmail.trim(),
          role: newRole
        });

        onProfileUpdated(newProfile);
        setCreateModalOpen(false);
        setNewName('');
        setNewEmail('');
        setNewPhone('');
        setNewPassword('Password123!');
        alert(`Account for "${newName.trim()}" provisioned successfully with role ${newRole.toUpperCase()}!`);
      }
    } catch (err: any) {
      alert(`Provisioning failed: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Top Filter and Search */}
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
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Account & Identity Governance</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Supervise user accounts across customers, barbershop owners, staff members, and platform admins.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setCreateModalOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>+</span> Create Account
          </button>

          <input
            type="text"
            placeholder="Search by name, phone or UUID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 250 }}
          />

          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-color)' }}>
            {(['all', 'customer', 'owner', 'staff', 'admin'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  background: roleFilter === r ? 'var(--accent-indigo)' : 'transparent',
                  color: roleFilter === r ? '#FFFFFF' : 'var(--text-secondary)'
                }}
              >
                {r} ({r === 'all' ? profiles.length : profiles.filter((p) => p.role === r).length})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>User Full Name</th>
                <th>Platform Role</th>
                <th>Phone Number</th>
                <th>User ID</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No accounts match the current query.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#818CF8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 13
                          }}
                        >
                          {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#FFFFFF' }}>{p.full_name}</div>
                          {p.id === adminId && (
                            <span style={{ fontSize: 10, color: 'var(--accent-indigo)', fontWeight: 700 }}>
                              (Current Session)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${p.role}`}>{p.role}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.phone || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                      {p.id.slice(0, 16)}...
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        style={{
                          background: 'rgba(99, 102, 241, 0.12)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: '#A5B4FC',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Edit Role
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Account */}
      {createModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 480,
              padding: 28,
              border: '1px solid rgba(99, 102, 241, 0.4)'
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Provision New Platform Account</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Create an account and assign platform privileges.
            </p>

            <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Platform Role
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['staff', 'owner', 'admin', 'customer'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewRole(r)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 12,
                        textTransform: 'capitalize',
                        background: newRole === r ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                        color: newRole === r ? '#FFFFFF' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Rohan Verma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="rohan@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Password123!"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
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
                  type="submit"
                  disabled={creating}
                  style={{
                    background: 'var(--accent-indigo)',
                    color: '#FFFFFF',
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontWeight: 800
                  }}
                >
                  {creating ? 'Creating Account...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User Role */}
      {editingProfile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 440,
              padding: 28,
              border: '1px solid rgba(99, 102, 241, 0.4)'
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Manage Account Role</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Adjust platform access permissions for &ldquo;{editingProfile.full_name}&rdquo;.
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)' }}>
                SELECT NEW ROLE:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['customer', 'staff', 'owner', 'admin'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    style={{
                      padding: '12px',
                      borderRadius: 8,
                      border: selectedRole === role ? '2px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                      background: selectedRole === role ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-secondary)',
                      color: selectedRole === role ? '#FFFFFF' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: 13,
                      textAlign: 'center',
                      textTransform: 'capitalize'
                    }}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                disabled={loading}
                onClick={() => setEditingProfile(null)}
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
                onClick={handleSaveRole}
                style={{
                  background: 'var(--accent-indigo)',
                  color: '#FFFFFF',
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontWeight: 800
                }}
              >
                {loading ? 'Updating...' : 'Save Role Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
