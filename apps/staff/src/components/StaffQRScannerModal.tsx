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

interface StaffQRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onVerifyCode: (tokenOrNumber: string) => Promise<void>;
}

export function StaffQRScannerModal({
  visible,
  onClose,
  onVerifyCode
}: StaffQRScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setManualCode('');
      setVerifying(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible, permission?.granted, requestPermission]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || verifying) return;
    setScanned(true);
    await processCode(data);
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim() || verifying) return;
    await processCode(manualCode.trim());
  };

  const processCode = async (code: string) => {
    setVerifying(true);
    try {
      await onVerifyCode(code);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not verify QR code';
      Alert.alert('Verification Error', message);
      setScanned(false);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Customer QR Check-In</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.subtitle}>
          Scan the arrival QR pass on the customer&apos;s phone to activate check-in.
        </Text>

        {/* Camera Viewfinder */}
        <View style={styles.cameraWrapper}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
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
              <Text style={styles.permissionText}>
                Camera permission is needed to scan customer QR passes.
              </Text>
              <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                <Text style={styles.grantBtnText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          )}

          {verifying && (
            <View style={styles.verifyingOverlay}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.verifyingText}>Verifying arrival...</Text>
            </View>
          )}
        </View>

        {/* Manual Code Input */}
        <View style={styles.manualEntryBox}>
          <Text style={styles.manualLabel}>Or enter Ticket # or QR token manually:</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 102 or token"
              placeholderTextColor="#64748B"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleManualSubmit}
              disabled={verifying || !manualCode.trim()}
            >
              <Text style={styles.submitText}>Verify</Text>
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
    backgroundColor: '#090D16',
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
    fontWeight: '700'
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800'
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 12
  },
  cameraWrapper: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
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
    borderColor: 'rgba(56, 189, 248, 0.4)'
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#38BDF8'
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
    backgroundColor: '#38BDF8',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  grantBtnText: {
    color: '#090D16',
    fontWeight: '800',
    fontSize: 14
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  verifyingText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
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
  manualRow: {
    flexDirection: 'row',
    gap: 10
  },
  input: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  submitBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitText: {
    color: '#090D16',
    fontSize: 14,
    fontWeight: '800'
  }
});
