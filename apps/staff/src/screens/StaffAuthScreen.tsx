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

interface StaffAuthScreenProps {
  onLoginSuccess: () => void;
}

export function StaffAuthScreen({ onLoginSuccess }: StaffAuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleLogin = async () => {
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) throw error;
      if (data.user) {
        onLoginSuccess();
      }
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Login failed';
      if (message.includes('Database error querying schema')) {
        message = 'Database error querying schema: auth.users has NULL token columns from raw SQL seeding. Run "supabase/fix_auth_schema.sql" in your Supabase SQL Editor to patch it in 1 second.';
      }
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const fillSeedStaff = () => {
    setEmail('staff.sam@quickcut.com');
    setPassword('Password123!');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.brandContainer}>
          <View style={styles.badgeIcon}>
            <Text style={styles.badgeText}>QC</Text>
          </View>
          <Text style={styles.title}>QuickCut Staff</Text>
          <Text style={styles.subtitle}>Barber Station Portal</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Staff Sign In</Text>
          <Text style={styles.cardSubtitle}>
            Log in with your barber or stylist credentials to manage your shop&apos;s live queue.
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Staff Email</Text>
            <TextInput
              style={styles.input}
              placeholder="staff@quickcut.com"
              placeholderTextColor="#64748B"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#090D16" />
            ) : (
              <Text style={styles.loginBtnText}>Open Station Queue</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Fill Button */}
        <View style={styles.demoBox}>
          <Text style={styles.demoLabel}>Demo Seed Account:</Text>
          <TouchableOpacity style={styles.demoBtn} onPress={fillSeedStaff}>
            <Text style={styles.demoBtnText}>Fill Sam Wilson (Staff)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16'
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
  badgeIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  badgeText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF'
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC'
  },
  subtitle: {
    fontSize: 14,
    color: '#38BDF8',
    marginTop: 2,
    fontWeight: '600'
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
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
  inputGroup: {
    marginBottom: 16
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155'
  },
  loginBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  loginBtnText: {
    color: '#090D16',
    fontSize: 16,
    fontWeight: '800'
  },
  demoBox: {
    marginTop: 24,
    alignItems: 'center'
  },
  demoLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8
  },
  demoBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8'
  },
  demoBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700'
  }
});
