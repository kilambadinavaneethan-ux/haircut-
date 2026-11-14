import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { getSupabaseClient } from '@quickcut/shared';

interface AuthScreenProps {
  onAuthSuccess: (user?: { id: string; email: string }) => void;
}

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    if (isSignUp && !fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Register customer with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim() || null,
              role: 'customer'
            }
          }
        });

        if (error) throw error;

        // 1. If Supabase immediately returns a session (auto-confirm enabled)
        if (data.session?.user) {
          onAuthSuccess({ id: data.session.user.id, email: data.session.user.email || '' });
          return;
        }

        // 2. Check if account already exists
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setIsSignUp(false);
          setErrorMessage('An account with this email already exists. Please sign in with your password.');
          return;
        }

        // 3. Try immediate sign-in to check if session can be established
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (signInData?.session?.user) {
          onAuthSuccess({ id: signInData.session.user.id, email: signInData.session.user.email || '' });
          return;
        }

        // 4. If Supabase requires email verification
        if (data.user) {
          setIsSignUp(false);
          setSuccessMessage(
            'Account created! A confirmation link was sent to your email. You can verify it or sign in directly.'
          );
          return;
        }
      } else {
        // Login with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (error) throw error;
        if (data.user) {
          onAuthSuccess({ id: data.user.id, email: data.user.email || '' });
        }
      }
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Authentication failed';
      if (message.includes('Database error querying schema')) {
        message = 'Database error querying schema: auth.users has NULL token columns from raw SQL seeding. Run "supabase/fix_auth_schema.sql" in your Supabase SQL Editor to patch it in 1 second.';
      } else if (message.includes('over_email_send_rate_limit') || message.includes('email rate limit exceeded')) {
        message = 'Email rate limit reached (Supabase free tier: max 3 emails/hour). You can sign in using one of the instant test accounts below or disable "Confirm email" in Supabase Auth Settings.';
      } else if (message.includes('User already registered')) {
        setIsSignUp(false);
        message = 'An account with this email already exists. Please sign in with your password.';
      } else if (message.includes('Email not confirmed')) {
        message = 'Your email address has not been confirmed yet. Please check your inbox or sign in with Rahul/Priya below.';
      } else if (message.includes('Invalid login credentials')) {
        message = 'Invalid email or password. Please double-check your credentials.';
      }
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  // Helper for quick testing with seed account
  const fillTestCustomer = (num: 1 | 2) => {
    if (num === 1) {
      setEmail('customer.rahul@quickcut.com');
      setPassword('Password123!');
      setIsSignUp(false);
    } else {
      setEmail('customer.priya@quickcut.com');
      setPassword('Password123!');
      setIsSignUp(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Logo Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>QC</Text>
          </View>
          <Text style={styles.brandTitle}>QuickCut</Text>
          <Text style={styles.brandSubtitle}>Customer Mobile App</Text>
        </View>

        {/* Auth Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isSignUp ? 'Create Customer Account' : 'Welcome Back'}
          </Text>
          <Text style={styles.cardSubtitle}>
            {isSignUp
              ? 'Join queues and skip the waiting room'
              : 'Sign in to access live queues and tickets'}
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          )}

          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor="#64748B"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.textInput}
              placeholder="name@example.com"
              placeholderTextColor="#64748B"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="+91 98765 43210"
                placeholderTextColor="#64748B"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Mode Switch */}
          <TouchableOpacity
            style={styles.switchModeBtn}
            onPress={() => {
              setIsSignUp(!isSignUp);
              setErrorMessage(null);
            }}
          >
            <Text style={styles.switchModeText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Create one"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Instant One-Tap Customer Access */}
        <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>Instant One-Tap Test Account:</Text>
          <View style={styles.demoButtonsRow}>
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => fillTestCustomer(1)}
            >
              <Text style={styles.demoBtnText}>Rahul Sharma</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => fillTestCustomer(2)}
            >
              <Text style={styles.demoBtnText}>Priya Patel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%'
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  logoBadgeText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A'
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  brandSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 20
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600'
  },
  successBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: '#22C55E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  successText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '600'
  },
  inputGroup: {
    marginBottom: 16
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6
  },
  textInput: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  submitBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8
  },
  submitBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800'
  },
  switchModeBtn: {
    marginTop: 18,
    alignItems: 'center'
  },
  switchModeText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600'
  },
  demoBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    alignItems: 'center'
  },
  demoTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8
  },
  demoButtonsRow: {
    flexDirection: 'row',
    gap: 10
  },
  demoBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  demoBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  }
});
