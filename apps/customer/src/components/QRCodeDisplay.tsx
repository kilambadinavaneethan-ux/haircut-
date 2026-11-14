import React, { useMemo } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { toQR } from 'toqr';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
}

/**
 * High-performance, offline pure-JS QR code renderer for React Native.
 * Encodes payload into a crisp 1-bit monochrome bitmap data URI.
 */
export function QRCodeDisplay({ value, size = 200 }: QRCodeDisplayProps) {
  const imageUri = useMemo(() => {
    try {
      if (!value) return null;
      const qr = toQR(value);
      const matrixSize = Math.round(Math.sqrt(qr.length));
      const border = 3;
      const totalSize = matrixSize + border * 2;
      const rowBytes = Math.ceil(totalSize / 32) * 4;
      const imageSize = rowBytes * totalSize;
      const fileSize = 54 + 8 + imageSize;

      const buf = new Uint8Array(fileSize);
      const view = new DataView(buf.buffer);

      // BMP Header (14 bytes)
      buf[0] = 0x42; // 'B'
      buf[1] = 0x4D; // 'M'
      view.setUint32(2, fileSize, true);
      view.setUint32(10, 62, true); // Offset to pixel array (54 + 8)

      // DIB Header (BITMAPINFOHEADER - 40 bytes)
      view.setUint32(14, 40, true);
      view.setInt32(18, totalSize, true); // Width
      view.setInt32(22, -totalSize, true); // Top-down height
      view.setUint16(26, 1, true); // 1 plane
      view.setUint16(28, 1, true); // 1-bit monochrome
      view.setUint32(30, 0, true); // BI_RGB (uncompressed)
      view.setUint32(34, imageSize, true);
      view.setInt32(38, 2835, true); // 72 DPI
      view.setInt32(42, 2835, true);
      view.setUint32(46, 2, true); // 2 colors
      view.setUint32(50, 2, true);

      // Color table (8 bytes): 0 = Black [0,0,0,0], 1 = White [255,255,255,0]
      buf[54] = 0; buf[55] = 0; buf[56] = 0; buf[57] = 0;
      buf[58] = 255; buf[59] = 255; buf[60] = 255; buf[61] = 0;

      // Pixel array
      for (let y = 0; y < totalSize; y++) {
        const rowOffset = 62 + y * rowBytes;
        for (let x = 0; x < totalSize; x++) {
          const qx = x - border;
          const qy = y - border;
          const isBlack = (qx >= 0 && qx < matrixSize && qy >= 0 && qy < matrixSize)
            ? (qr[qy * matrixSize + qx] === 1)
            : false;

          if (!isBlack) {
            // Set bit to 1 for white pixel
            const byteIdx = rowOffset + (x >> 3);
            const bitIdx = 7 - (x & 7);
            buf[byteIdx] |= (1 << bitIdx);
          }
        }
      }

      // Convert buffer to Base64
      let binary = '';
      const len = buf.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(buf[i]);
      }
      
      const b64 = typeof btoa !== 'undefined'
        ? btoa(binary)
        : (typeof Buffer !== 'undefined' ? Buffer.from(binary, 'binary').toString('base64') : '');

      return `data:image/bmp;base64,${b64}`;
    } catch (e) {
      console.warn('Could not generate QR code BMP:', e);
      return null;
    }
  }, [value]);

  if (!imageUri) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <ActivityIndicator color="#0D9488" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={{ uri: imageUri }}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3
  }
});
