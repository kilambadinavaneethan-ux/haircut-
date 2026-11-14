import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Linking,
  ScrollView,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import CustomerApp from './apps/customer/App';
import StaffApp from './apps/staff/App';

/**
 * QuickCut Monorepo Unified Root Entry Point
 *
 * Provides an instant multi-app switcher when `expo start` is run at the monorepo root:
 * - 📱 Customer Mobile App (Queue discovery, wait-times, personal QR pass)
 * - 💈 Staff Barber Station (Queue management, QR pass scanner, seat/complete customers)
 * - 👑 Admin & Owner Portals (Super Admin Web Portal and Shop Owner Dashboard links & guide)
 */
export default function RootMonorepoApp() {
  const [activeApp, setActiveApp] = useState('customer'); // 'customer' | 'staff' | 'admin'

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="light" />

      {/* Main Content Area */}
      <View style={styles.appContainer}>
        {activeApp === 'customer' && <CustomerApp />}
        {activeApp === 'staff' && <StaffApp />}
        {activeApp === 'admin' && (
          <SafeAreaView style={styles.adminWrapper}>
            <ScrollView contentContainerStyle={styles.adminScroll}>
              <View style={styles.crownBadge}>
                <Text style={styles.crownText}>👑</Text>
              </View>
              <Text style={styles.portalTitle}>QuickCut Admin Station</Text>
              <Text style={styles.portalSubtitle}>
                Super Admin & Shop Owner Portals are desktop & tablet web applications built with React and Vite.
              </Text>

              {/* Super Admin Card */}
              <View style={styles.portalCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.portalCardBadge}>PORT 3002</Text>
                  <Text style={styles.portalCardTitle}>Super Admin Dashboard</Text>
                </View>
                <Text style={styles.portalCardDesc}>
                  Approve new barbershops, inspect multi-role audit logs, configure platform rules, and investigate queue anomalies.
                </Text>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL('http://localhost:3002')}
                >
                  <Text style={styles.actionBtnText}>Launch Admin Web Portal</Text>
                </TouchableOpacity>
                <View style={styles.credsBox}>
                  <Text style={styles.credsLabel}>Seed Admin Account:</Text>
                  <Text style={styles.credsValue}>admin@quickcut.com  •  Password123!</Text>
                </View>
              </View>

              {/* Shop Owner Card */}
              <View style={styles.portalCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.portalCardBadge, { backgroundColor: '#3B82F6' }]}>PORT 3001</Text>
                  <Text style={styles.portalCardTitle}>Shop Owner Dashboard</Text>
                </View>
                <Text style={styles.portalCardDesc}>
                  Manage shop haircut services, assign barbers, monitor real-time queue length, and view earnings.
                </Text>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                  onPress={() => Linking.openURL('http://localhost:3001')}
                >
                  <Text style={styles.actionBtnText}>Launch Owner Web Portal</Text>
                </TouchableOpacity>
                <View style={styles.credsBox}>
                  <Text style={styles.credsLabel}>Seed Owner Account:</Text>
                  <Text style={styles.credsValue}>owner.vikram@quickcut.com  •  Password123!</Text>
                </View>
              </View>

              {/* Terminal Quick Start */}
              <View style={styles.terminalBox}>
                <Text style={styles.terminalHeader}>💻 Start from Terminal:</Text>
                <Text style={styles.terminalLine}>npm run dev:admin  # Admin Web (Port 3002)</Text>
                <Text style={styles.terminalLine}>npm run dev:owner  # Owner Web (Port 3001)</Text>
                <Text style={styles.terminalLine}>npm run dev:all    # All 4 apps at once</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </View>

      {/* Floating App Switcher Bar */}
      <SafeAreaView style={styles.switcherSafeArea}>
        <View style={styles.switcherBar}>
          <TouchableOpacity
            style={[styles.switcherTab, activeApp === 'customer' && styles.switcherTabActive]}
            onPress={() => setActiveApp('customer')}
          >
            <Text style={[styles.tabLabel, activeApp === 'customer' && styles.tabLabelActive]}>
              📱 Customer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.switcherTab, activeApp === 'staff' && styles.switcherTabActive]}
            onPress={() => setActiveApp('staff')}
          >
            <Text style={[styles.tabLabel, activeApp === 'staff' && styles.tabLabelActive]}>
              💈 Staff App
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.switcherTab, activeApp === 'admin' && styles.switcherTabActive]}
            onPress={() => setActiveApp('admin')}
          >
            <Text style={[styles.tabLabel, activeApp === 'admin' && styles.tabLabelActive]}>
              👑 Admin Web
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  appContainer: {
    flex: 1
  },
  switcherSafeArea: {
    backgroundColor: '#090D16',
    borderTopWidth: 1,
    borderTopColor: '#1E293B'
  },
  switcherBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#090D16',
    justifyContent: 'space-around'
  },
  switcherTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#1E293B'
  },
  switcherTabActive: {
    backgroundColor: '#F59E0B'
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8'
  },
  tabLabelActive: {
    color: '#0F172A'
  },
  adminWrapper: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  adminScroll: {
    padding: 20,
    alignItems: 'center'
  },
  crownBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginTop: 16,
    marginBottom: 12
  },
  crownText: {
    fontSize: 32
  },
  portalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center'
  },
  portalSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20
  },
  portalCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  portalCardBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 10
  },
  portalCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  portalCardDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
    marginBottom: 16
  },
  actionBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12
  },
  actionBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14
  },
  credsBox: {
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  credsLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600'
  },
  credsValue: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  terminalBox: {
    width: '100%',
    backgroundColor: '#090D16',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 8
  },
  terminalHeader: {
    color: '#F59E0B',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8
  },
  terminalLine: {
    color: '#10B981',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    marginBottom: 4
  }
});
