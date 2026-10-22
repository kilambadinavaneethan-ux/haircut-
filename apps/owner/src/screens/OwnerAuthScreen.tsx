import React, { useState } from 'react';
import { getSupabaseClient } from '@quickcut/shared';

interface OwnerAuthScreenProps {
  onAuthSuccess: () => void;
}

export function OwnerAuthScreen({ onAuthSuccess }: OwnerAuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    if (isSignUp && !fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Sign up new shop owner
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim() || null,
              role: 'owner'
            }
          }
        });

        if (error) throw error;
        if (data.user) {
          onAuthSuccess();
        }
      } else {
        // Sign in existing shop owner
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (error) throw error;
        if (data.user) {
          onAuthSuccess();
        }
      }
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('Database error querying schema')) {
        msg = 'Database error querying schema: auth.users has NULL token columns from raw SQL seeding. Run "supabase/fix_auth_schema.sql" in your Supabase SQL Editor to patch it in 1 second.';
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillSeedOwner = () => {
    setEmail('owner.alex@quickcut.com');
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
        background: 'radial-gradient(ellipse at top, #1E293B 0%, #0A0F1D 70%)'
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: '#0A0F1D',
              fontSize: 24,
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.4)'
            }}
          >
            QC
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF' }}>QuickCut Owner</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
            Shop Management & Live Queue Portal
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
            {isSignUp ? 'Register as Shop Owner' : 'Owner Sign In'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            {isSignUp
              ? 'Create your account to register and manage your barbershop'
              : 'Sign in to access your shop live queues, staff, and financial statements'}
          </p>

          {errorMessage && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-red)',
                color: 'var(--accent-red)',
                padding: '12px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16
              }}
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSignUp && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Miller"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>

            {isSignUp && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 00002"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: 'var(--accent-gold)',
                color: '#0A0F1D',
                padding: '14px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 15,
                marginTop: 8
              }}
            >
              {loading ? 'Authenticating...' : isSignUp ? 'Create Owner Account' : 'Sign In to Dashboard'}
            </button>
          </form>

          {/* Toggle Sign in / Sign up */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMessage(null);
              }}
              style={{
                background: 'transparent',
                color: 'var(--accent-blue)',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {isSignUp ? 'Already registered? Sign In instead' : "Don't have an owner account? Register here"}
            </button>
          </div>
        </div>

        {/* Quick Fill Test Account */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Test Seed Account:</p>
          <button
            type="button"
            onClick={fillSeedOwner}
            style={{
              background: '#131B2E',
              border: '1px solid var(--border-color)',
              color: 'var(--accent-gold)',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Fill Alex Miller (Owner of Crown & Blade)
          </button>
        </div>
      </div>
    </div>
  );
}
