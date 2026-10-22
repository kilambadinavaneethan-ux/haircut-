import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert
} from 'react-native';
import { Profile, getSupabaseClient } from '@quickcut/shared';

interface ProfileScreenProps {
  profile: Profile | null;
  email: string | null;
  onSignOut: () => void;
}

export function ProfileScreen({ profile, email, onSignOut }: ProfileScreenProps) {
  const supabase = getSupabaseClient();

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of QuickCut?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            onSignOut();
          } catch (err) {
            console.warn('Sign out error:', err);
            onSignOut();
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Customer Profile</Text>
      <Text style={styles.screenSubtitle}>Your QuickCut account and settings</Text>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLetter}>
            {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'C'}
          </Text>
        </View>

        <Text style={styles.fullName}>{profile?.full_name || 'Customer'}</Text>
        <Text style={styles.emailText}>{email || 'customer@quickcut.com'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>CUSTOMER ACCOUNT</Text>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Role</Text>
            <Text style={styles.infoValue}>Customer</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone Number</Text>
            <Text style={styles.infoValue}>{profile?.phone || 'Not provided'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>User ID</Text>
            <Text style={styles.infoValueMono}>
              {profile?.id ? `${profile.id.slice(0, 16)}...` : 'Unknown'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutBtnText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
    marginBottom: 20
  },
  profileCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  avatarLetter: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A'
  },
  fullName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  emailText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2
  },
  roleBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginTop: 10
  },
  roleBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800'
  },
  infoSection: {
    width: '100%',
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 13
  },
  infoValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600'
  },
  infoValueMono: {
    color: '#64748B',
    fontSize: 12,
    fontFamily: 'monospace'
  },
  signOutBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24
  },
  signOutBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700'
  }
});
