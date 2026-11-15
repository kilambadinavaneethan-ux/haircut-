import React, { useState } from 'react';
import { getSupabaseClient } from '@quickcut/shared';
import type { Profile } from '@quickcut/shared';
import type { User } from '@supabase/supabase-js';

interface AdminAuthScreenProps {
  onLoginSuccess: (user: User, profile: Profile) => void;
}

export default function AdminAuthScreen({ onLoginSuccess }: AdminAuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [securityKey, setSecurityKey] = useState('QUICKCUT2026');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Register New Admin Account
        if (!fullName.trim()) {
          throw new Error('Please enter your full name.');
        }

        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim() || null,
              role: 'admin'
            }
          }
        });

        if (signUpError) {
          throw signUpError;
        }

        const userId = signUpData.user?.id || signUpData.session?.user?.id;
        if (!userId) {
          throw new Error('Registration failed. Please try again.');
        }

        // Guarantee profile role is 'admin'
        const newProfile: Profile = {
          id: userId,
          role: 'admin',
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await (supabase.from('profiles') as any).upsert(newProfile);

        // Attempt immediate login
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (signInData?.user) {
          onLoginSuccess(signInData.user, newProfile);
          return;
        }

        if (signUpData.session?.user) {
          onLoginSuccess(signUpData.session.user, newProfile);
          return;
        }

        setIsSignUp(false);
        setSuccessMessage('Administrator account created! Please sign in with your credentials.');
      } else {
        // Sign In Existing Admin Account
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

        // Fetch user profile and verify 'admin' role
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileError || !profileData) {
          // If profile missing, self-heal as admin if email indicates admin
          if (authData.user.email?.includes('admin')) {
            const healedProfile: Profile = {
              id: authData.user.id,
              role: 'admin',
              full_name: authData.user.email.split('@')[0],
              phone: null,
              avatar_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            await (supabase.from('profiles') as any).upsert(healedProfile);
            onLoginSuccess(authData.user, healedProfile);
            return;
          }
          await supabase.auth.signOut();
          throw new Error('Unable to retrieve administrative profile. Access denied.');
        }

        const profile = profileData as unknown as Profile;

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
        } catch {
          // Non-blocking audit failure
        }

        onLoginSuccess(authData.user, profile);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickCredentials = () => {
    setEmail('admin@quickcut.com');
    setPassword('Password123!');
    setIsSignUp(false);
    setErrorMessage(null);
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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
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
              marginBottom: 14
            }}
          >
            QC
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF' }}>QuickCut Super Admin</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Master Platform Control & Security Administration
          </p>
        </div>

        {/* Mode Toggle Switch */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 8,
            padding: 3,
            marginBottom: 20
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              background: !isSignUp ? 'var(--accent-indigo)' : 'transparent',
              color: !isSignUp ? '#FFFFFF' : 'var(--text-secondary)'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              background: isSignUp ? 'var(--accent-indigo)' : 'transparent',
              color: isSignUp ? '#FFFFFF' : 'var(--text-secondary)'
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="alert-box alert-danger" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="alert-box alert-success" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div>{successMessage}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isSignUp && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                    textTransform: 'uppercase'
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Sarah Connor"
                  style={{ width: '100%' }}
                  disabled={loading}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                    textTransform: 'uppercase'
                  }}
                >
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 99000 11111"
                  style={{ width: '100%' }}
                  disabled={loading}
                />
              </div>
            </>
          )}

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: 6,
                textTransform: 'uppercase'
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
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: 6,
                textTransform: 'uppercase'
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

          {isSignUp && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                  textTransform: 'uppercase'
                }}
              >
                Security Passcode
              </label>
              <input
                type="text"
                value={securityKey}
                onChange={(e) => setSecurityKey(e.target.value)}
                placeholder="QUICKCUT2026"
                style={{ width: '100%' }}
                disabled={loading}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Platform authorization key: QUICKCUT2026
              </div>
            </div>
          )}

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
              marginTop: 6,
              boxShadow: '0 4px 14px var(--accent-indigo-glow)'
            }}
          >
            {loading
              ? isSignUp
                ? 'Registering Administrator...'
                : 'Verifying Super Admin Privileges...'
              : isSignUp
              ? 'Create Administrator Account'
              : 'Authenticate as Super Admin'}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--border-color)',
            textAlign: 'center'
          }}
        >
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
