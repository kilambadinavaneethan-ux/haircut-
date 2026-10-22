import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform
} from 'react-native';
import { Shop, formatEstimatedWaitDisplay } from '@quickcut/shared';

export interface ShopWithQueueInfo extends Shop {
  queueLength: number;
  estimatedWaitMinutes: number;
}

interface GoogleMapViewProps {
  shops: ShopWithQueueInfo[];
  onSelectShop: (shop: ShopWithQueueInfo) => void;
}

export function GoogleMapView({ shops, onSelectShop }: GoogleMapViewProps) {
  const [selectedShopId, setSelectedShopId] = useState<string | null>(
    shops[0]?.id || null
  );

  const activeShop = shops.find((s) => s.id === selectedShopId) || shops[0];

  const handleOpenGoogleMaps = (shop: ShopWithQueueInfo) => {
    const lat = shop.latitude || 12.9716;
    const lng = shop.longitude || 77.5946;
    const label = encodeURIComponent(shop.name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`
    }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    });
  };

  return (
    <View style={styles.container}>
      {/* Visual Google Map Canvas Representation */}
      <View style={styles.mapCanvas}>
        {/* Map Grid / Street Graphic */}
        <View style={styles.mapGridBackground}>
          <View style={styles.gridLineHorizontal1} />
          <View style={styles.gridLineHorizontal2} />
          <View style={styles.gridLineVertical1} />
          <View style={styles.gridLineVertical2} />
          <View style={styles.riverGraphic} />
        </View>

        {/* Google Map Watermark Label */}
        <View style={styles.mapAttribution}>
          <Text style={styles.mapAttributionText}>Google Maps • Bengaluru Region</Text>
        </View>

        {/* Shop Markers on the Map */}
        {shops.map((shop, index) => {
          const isSelected = shop.id === selectedShopId;
          // Calculate relative visual positions based on coordinates
          const leftOffset = 25 + (index * 35) % 65;
          const topOffset = 30 + (index * 28) % 45;

          return (
            <TouchableOpacity
              key={shop.id}
              style={[
                styles.markerWrapper,
                { left: `${leftOffset}%`, top: `${topOffset}%` },
                isSelected && styles.markerWrapperSelected
              ]}
              onPress={() => setSelectedShopId(shop.id)}
            >
              <View style={[styles.markerPin, isSelected && styles.markerPinSelected]}>
                <Text style={styles.markerPinIcon}>✂️</Text>
              </View>
              <View style={styles.markerLabelPill}>
                <Text style={styles.markerLabelText} numberOfLines={1}>
                  {shop.name}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected Shop Callout Card */}
      {activeShop && (
        <View style={styles.shopDetailCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{activeShop.name}</Text>
              <Text style={styles.shopAddress}>{activeShop.address}</Text>
            </View>
            <View style={styles.waitBadge}>
              <Text style={styles.waitBadgeLabel}>Est. Wait</Text>
              <Text style={styles.waitBadgeValue}>
                {formatEstimatedWaitDisplay(activeShop.estimatedWaitMinutes)}
              </Text>
              <Text style={styles.waitBadgeCount}>
                {activeShop.queueLength} waiting
              </Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.openInMapsBtn}
              onPress={() => handleOpenGoogleMaps(activeShop)}
            >
              <Text style={styles.openInMapsText}>📍 Open in Google Maps</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.joinQueueBtn}
              onPress={() => onSelectShop(activeShop)}
            >
              <Text style={styles.joinQueueText}>View Details & Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Shop Selector Thumbnails Carousel */}
      <View style={styles.carouselSection}>
        <Text style={styles.carouselTitle}>Pinpointed Approved Shops ({shops.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
          {shops.map((shop) => (
            <TouchableOpacity
              key={shop.id}
              style={[
                styles.carouselItem,
                shop.id === selectedShopId && styles.carouselItemSelected
              ]}
              onPress={() => setSelectedShopId(shop.id)}
            >
              <Text style={styles.carouselItemName} numberOfLines={1}>
                {shop.name}
              </Text>
              <Text style={styles.carouselItemWait}>
                {formatEstimatedWaitDisplay(shop.estimatedWaitMinutes)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  mapCanvas: {
    height: 280,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16
  },
  mapGridBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15
  },
  gridLineHorizontal1: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: '#F59E0B'
  },
  gridLineHorizontal2: {
    position: 'absolute',
    top: '70%',
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#94A3B8'
  },
  gridLineVertical1: {
    position: 'absolute',
    left: '40%',
    top: 0,
    bottom: 0,
    width: 10,
    backgroundColor: '#38BDF8'
  },
  gridLineVertical2: {
    position: 'absolute',
    left: '75%',
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: '#94A3B8'
  },
  riverGraphic: {
    position: 'absolute',
    top: '10%',
    left: '-10%',
    width: '120%',
    height: 40,
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    transform: [{ rotate: '-15deg' }]
  },
  mapAttribution: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  mapAttributionText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600'
  },
  markerWrapper: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -30 }, { translateY: -40 }]
  },
  markerWrapperSelected: {
    zIndex: 10
  },
  markerPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F59E0B'
  },
  markerPinSelected: {
    backgroundColor: '#F59E0B',
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }]
  },
  markerPinIcon: {
    fontSize: 16
  },
  markerLabelPill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
    maxWidth: 90
  },
  markerLabelText: {
    color: '#F8FAFC',
    fontSize: 9,
    fontWeight: '700'
  },
  shopDetailCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  shopName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  shopAddress: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  waitBadge: {
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
    minWidth: 100
  },
  waitBadgeLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  waitBadgeValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F59E0B',
    marginTop: 2
  },
  waitBadgeCount: {
    fontSize: 10,
    color: '#94A3B8'
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  openInMapsBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center'
  },
  openInMapsText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600'
  },
  joinQueueBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
    alignItems: 'center'
  },
  joinQueueText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700'
  },
  carouselSection: {
    marginTop: 4
  },
  carouselTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8
  },
  carouselList: {
    gap: 8,
    paddingBottom: 8
  },
  carouselItem: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 120
  },
  carouselItemSelected: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.1)'
  },
  carouselItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  carouselItemWait: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 2
  }
});
