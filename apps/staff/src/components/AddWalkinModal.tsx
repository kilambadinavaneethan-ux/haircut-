import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Service } from '@quickcut/shared';

interface AddWalkinModalProps {
  visible: boolean;
  services: Service[];
  onClose: () => void;
  onAddWalkin: (guestName: string, serviceId: string) => Promise<void>;
}

export function AddWalkinModal({
  visible,
  services,
  onClose,
  onAddWalkin
}: AddWalkinModalProps) {
  const [guestName, setGuestName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    services[0]?.id || ''
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!guestName.trim()) {
      Alert.alert('Name Required', 'Please enter guest name.');
      return;
    }
    if (!selectedServiceId && services.length > 0) {
      setSelectedServiceId(services[0].id);
    }

    setLoading(true);
    try {
      await onAddWalkin(guestName.trim(), selectedServiceId || services[0]?.id);
      setGuestName('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not add walk-in';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <Text style={styles.title}>Add Walk-In Guest</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Billing Exemption Notice */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              ℹ️ Walk-in guests are marked as <Text style={{ fontWeight: '800' }}>is_walkin: true</Text> and are <Text style={{ fontWeight: '800' }}>exempt</Text> from platform fees (₹0.00).
            </Text>
          </View>

          <Text style={styles.inputLabel}>Guest Name / Identifier</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. David Miller"
            placeholderTextColor="#64748B"
            value={guestName}
            onChangeText={setGuestName}
          />

          <Text style={styles.inputLabel}>Select Service</Text>
          <ScrollView style={styles.serviceList} contentContainerStyle={{ paddingBottom: 10 }}>
            {services.map((svc) => {
              const isSelected = (selectedServiceId || services[0]?.id) === svc.id;
              return (
                <TouchableOpacity
                  key={svc.id}
                  style={[styles.serviceOption, isSelected && styles.serviceOptionSelected]}
                  onPress={() => setSelectedServiceId(svc.id)}
                >
                  <View>
                    <Text style={styles.serviceName}>{svc.name}</Text>
                    <Text style={styles.serviceMeta}>~{svc.avg_minutes} mins duration</Text>
                  </View>
                  <Text style={styles.servicePrice}>₹{svc.price}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Large Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading || !guestName.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#090D16" />
              ) : (
                <Text style={styles.submitBtnText}>Enqueue Walk-in</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end'
  },
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: '#1E293B'
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  closeBtn: {
    padding: 6
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700'
  },
  infoBanner: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16
  },
  infoBannerText: {
    color: '#38BDF8',
    fontSize: 12,
    lineHeight: 18
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 8
  },
  textInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16
  },
  serviceList: {
    maxHeight: 180,
    marginBottom: 16
  },
  serviceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  serviceOptionSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)'
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  serviceMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#38BDF8'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center'
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 14
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#38BDF8',
    alignItems: 'center'
  },
  submitBtnText: {
    color: '#090D16',
    fontWeight: '800',
    fontSize: 15
  }
});
