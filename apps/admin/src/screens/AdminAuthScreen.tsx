import React, { useState } from 'react';
import { getSupabaseClient } from '@quickcut/shared';
import type { Profile } from '@quickcut/shared';
import type { User } from '@supabase/supabase-js';

interface AdminAuthScreenProps {
  onLoginSuccess: (user: User, profile: Profile) => void;
}

export default function AdminAuthScreen({ onLoginSuccess }: AdminAuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (authError || !authData.user) {
        if (authError?.message?.includes('Database error querying schema')) {
          throw new Error(
            'Database error querying schema: auth.users has NULL token columns from raw SQL seeding. Run "supabase/fix_auth_schema.sql" in your Supabase SQL Editor to patch it in 1 second.'
          );
        }
        throw new Error(authError?.message || 'Invalid administrator credentials');
      }

      // 2. Fetch user profile and verify 'admin' role
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        // Fallback check: if email is admin@quickcut.com and profile is empty/missing
        if (authData.user.email === 'admin@quickcut.com') {
          const adminProfile: Profile = {
            id: authData.user.id,
            role: 'admin',
            full_name: 'Super Administrator',
            phone: '+91 99999 00000',
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          onLoginSuccess(authData.user, adminProfile);
          return;
        }
        await supabase.auth.signOut();
        throw new Error('Unable to retrieve administrative profile.');
      }

      const profile = profileData as unknown as Profile;

      // 3. Strict Admin Role Gate
      if (profile.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error(
          `Access Denied: Account "${authData.user.email}" possesses role "${profile.role}". Only users with the Super Admin role can access this console.`
        );
      }

      // Record admin login to audit logs
      try {
        await (supabase.from('audit_logs') as any).insert({
          user_id: authData.user.id,
          action: 'ADMIN_LOGIN_SUCCESS',
          entity_type: 'auth',
          entity_id: authData.user.id,
          payload: { email: authData.user.email, timestamp: new Date().toISOString() },
          ip_address: 'admin-console'
        });
      } catch (logErr) {
        console.warn('Could not write audit log:', logErr);
      }

      onLoginSuccess(authData.user, profile);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickCredentials = () => {
    setEmail('admin@quickcut.com');
    setPassword('Password123!');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at 50% 10%, #151D38 0%, #070A13 100%)'
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '36px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8)',
          border: '1px solid rgba(99, 102, 241, 0.3)'
        }}
      >
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 58,
              height: 58,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
              color: '#FFFFFF',
              fontSize: 26,
              fontWeight: 900,
              boxShadow: '0 8px 24px var(--accent-indigo-glow)',
              marginBottom: 16
            }}
          >
            QC
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF' }}>QuickCut Super Admin</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
            Master Platform Control & Security Administration
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="alert-box alert-danger" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Admin Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@quickcut.com"
              style={{ width: '100%' }}
              disabled={loading}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%' }}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              color: '#FFFFFF',
              padding: '12px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              marginTop: 8,
              boxShadow: '0 4px 14px var(--accent-indigo-glow)'
            }}
          >
            {loading ? 'Verifying Super Admin Privileges...' : 'Authenticate as Super Admin'}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid var(--border-color)',
            textAlign: 'center'
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Super Admin Seed Credentials:
          </p>
          <button
            type="button"
            onClick={fillQuickCredentials}
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#A5B4FC',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600
            }}
          >
            Auto-Fill Admin (`admin@quickcut.com`)
          </button>
        </div>
      </div>
    </div>
  );
}
