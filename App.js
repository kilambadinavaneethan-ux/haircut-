import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import CustomerApp from './apps/customer/App';
import StaffApp from './apps/staff/App';
import AdminMobileApp from './apps/admin-mobile/App';
import OwnerMobileApp from './apps/owner-mobile/App';

/**
 * QuickCut Monorepo Unified Root Entry Point
 *
 * Each application is a complete, standalone mobile app:
 * - 📱 Customer App (apps/customer)
 * - 💈 Staff App (apps/staff)
 * - 👑 Admin Mobile App (apps/admin-mobile)
 * - 🏪 Owner Mobile App (apps/owner-mobile)
 *
 * To launch any app directly without this selector:
 *   npm run customer   (or npm run dev:customer)
 *   npm run staff      (or npm run dev:staff)
 *   npm run admin      (or npm run dev:admin:mobile)
 *   npm run owner      (or npm run dev:owner:mobile)
 */
export default function RootMonorepoApp() {
  const target = process.env.EXPO_PUBLIC_APP_TARGET;
  const [selectedApp, setSelectedApp] = useState(target || null);

  // 1. Standalone Customer App (100% full screen, zero switcher tabs)
  if (selectedApp === 'customer') {
    return (
      <View style={styles.fullScreenWrapper}>
        <CustomerApp />
        <TouchableOpacity
          style={styles.exitPill}
          onPress={() => setSelectedApp(null)}
          activeOpacity={0.8}
        >
          <Text style={styles.exitPillText}>⎋ Switch App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 2. Standalone Staff App (100% full screen, zero switcher tabs)
  if (selectedApp === 'staff') {
    return (
      <View style={styles.fullScreenWrapper}>
        <StaffApp />
        <TouchableOpacity
          style={styles.exitPill}
          onPress={() => setSelectedApp(null)}
          activeOpacity={0.8}
        >
          <Text style={styles.exitPillText}>⎋ Switch App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. Standalone Admin Mobile App (100% full screen, zero switcher tabs)
  if (selectedApp === 'admin') {
    return (
      <View style={styles.fullScreenWrapper}>
        <AdminMobileApp />
        <TouchableOpacity
          style={styles.exitPill}
          onPress={() => setSelectedApp(null)}
          activeOpacity={0.8}
        >
          <Text style={styles.exitPillText}>⎋ Switch App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 4. Standalone Owner Mobile App (100% full screen, zero switcher tabs)
  if (selectedApp === 'owner') {
    return (
      <View style={styles.fullScreenWrapper}>
        <OwnerMobileApp />
        <TouchableOpacity
          style={styles.exitPill}
          onPress={() => setSelectedApp(null)}
          activeOpacity={0.8}
        >
          <Text style={styles.exitPillText}>⎋ Switch App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 5. Clean App Selector (Shown when root `expo start` is run without target)
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.brandTitle}>QuickCut Apps</Text>
          <Text style={styles.brandSubtitle}>
            Select which separate application to open:
          </Text>
        </View>

        {/* Option 1: Customer App */}
        <TouchableOpacity
          style={styles.appCard}
          onPress={() => setSelectedApp('customer')}
          activeOpacity={0.85}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.cardEmoji}>📱</Text>
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitle}>Customer Mobile App</Text>
            <Text style={styles.cardDesc}>
              Barbershop discovery, live queue wait-times, and personal QR arrival pass.
            </Text>
            <View style={styles.badgeRow}>
              <Text style={styles.badgeCustomer}>Separate Customer App</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Option 2: Staff App */}
        <TouchableOpacity
          style={styles.appCard}
          onPress={() => setSelectedApp('staff')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconCircle, { borderColor: '#3B82F6' }]}>
            <Text style={styles.cardEmoji}>💈</Text>
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitle}>Staff Barber Station</Text>
            <Text style={styles.cardDesc}>
              Manage shop queue, call next customer, QR arrival pass scanner, and walk-ins.
            </Text>
            <View style={styles.badgeRow}>
              <Text style={styles.badgeStaff}>Separate Staff App</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Option 3: Admin Mobile App */}
        <TouchableOpacity
          style={styles.appCard}
          onPress={() => setSelectedApp('admin')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconCircle, { borderColor: '#F59E0B' }]}>
            <Text style={styles.cardEmoji}>👑</Text>
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitle}>Super Admin Mobile App</Text>
            <Text style={styles.cardDesc}>
              Approve new barbershops, live platform analytics, tamper audit logs, and tickets.
            </Text>
            <View style={styles.badgeRow}>
              <Text style={styles.badgeAdmin}>Separate Admin App</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Option 4: Owner Mobile App */}
        <TouchableOpacity
          style={styles.appCard}
          onPress={() => setSelectedApp('owner')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconCircle, { borderColor: '#60A5FA' }]}>
            <Text style={styles.cardEmoji}>🏪</Text>
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitle}>Shop Owner Mobile App</Text>
            <Text style={styles.cardDesc}>
              Monitor live shop queue, add services & pricing, and track 100% of revenue.
            </Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.badgeStaff, { color: '#60A5FA' }]}>Separate Owner App</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Terminal Commands Guide */}
        <View style={styles.terminalBox}>
          <Text style={styles.terminalTitle}>💻 Run Separately From Terminal:</Text>
          <Text style={styles.terminalCode}>npm run customer  # Customer App (Port 8081)</Text>
          <Text style={styles.terminalCode}>npm run staff     # Staff Barber App (Port 8082)</Text>
          <Text style={styles.terminalCode}>npm run admin     # Admin Mobile App (Port 8083)</Text>
          <Text style={styles.terminalCode}>npm run owner     # Owner Mobile App (Port 8084)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullScreenWrapper: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  exitPill: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 9999
  },
  exitPillText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700'
  },
  container: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  scroll: {
    padding: 20,
    paddingTop: 36
  },
  header: {
    alignItems: 'center',
    marginBottom: 24
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  brandSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6
  },
  appCard: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center'
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  cardEmoji: {
    fontSize: 26
  },
  cardDetails: {
    flex: 1
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  cardDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
    marginTop: 4
  },
  badgeRow: {
    marginTop: 8
  },
  badgeCustomer: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  badgeStaff: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  badgeAdmin: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  terminalBox: {
    marginTop: 16,
    backgroundColor: '#0B0F19',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  terminalTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8
  },
  terminalCode: {
    color: '#10B981',
    fontSize: 11,
    fontFamily: Platform?.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4
  }
});
