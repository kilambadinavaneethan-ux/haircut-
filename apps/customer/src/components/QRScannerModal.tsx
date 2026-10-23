import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface QRScannerModalProps {
  visible: boolean;
  shopName: string;
  onClose: () => void;
  onCheckInSuccess: (tokenOrPayload: string) => Promise<void>;
}

export function QRScannerModal({
  visible,
  shopName,
  onClose,
  onCheckInSuccess
}: QRScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setManualCode('');
      setIsVerifying(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible, permission?.granted, requestPermission]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || isVerifying) return;
    setScanned(true);
    await processCheckIn(data);
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim() || isVerifying) return;
    await processCheckIn(manualCode.trim());
  };

  const processCheckIn = async (code: string) => {
    setIsVerifying(true);
    try {
      await onCheckInSuccess(code);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid shop QR code';
      Alert.alert('Check-In Failed', message);
      setScanned(false);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Shop QR Code</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.subtitle}>
          Point camera at the QR code displayed at <Text style={styles.highlight}>{shopName}</Text> to check in.
        </Text>

        {/* Camera Scanner View */}
        <View style={styles.cameraWrapper}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr']
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            >
              <View style={styles.overlay}>
                <View style={styles.targetFrame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </View>
            </CameraView>
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>Camera permission is required to scan QR code.</Text>
              <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                <Text style={styles.grantBtnText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          )}

          {isVerifying && (
            <View style={styles.verifyingOverlay}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.verifyingText}>Verifying check-in with shop...</Text>
            </View>
          )}
        </View>

        {/* Fallback code entry */}
        <View style={styles.manualEntryBox}>
          <Text style={styles.manualLabel}>Or enter shop check-in code manually:</Text>
          <View style={styles.manualInputRow}>
            <TextInput
              style={styles.manualInput}
              placeholder="e.g. SHOP-CHECKIN or token"
              placeholderTextColor="#64748B"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.manualSubmitBtn}
              onPress={handleManualSubmit}
              disabled={isVerifying || !manualCode.trim()}
            >
              <Text style={styles.manualSubmitText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 50,
    paddingHorizontal: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  closeBtn: {
    padding: 8
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '600'
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700'
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 12
  },
  highlight: {
    color: '#F59E0B',
    fontWeight: '700'
  },
  cameraWrapper: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1E293B',
    marginVertical: 10
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  targetFrame: {
    width: 220,
    height: 220,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)'
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#F59E0B'
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  permissionText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16
  },
  grantBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  grantBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  verifyingText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12
  },
  manualEntryBox: {
    paddingVertical: 20
  },
  manualLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 8
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 10
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  manualSubmitBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  manualSubmitText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700'
  }
});
