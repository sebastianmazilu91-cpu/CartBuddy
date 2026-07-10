import { Image, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { formatDistance } from '../formatters';
import { translate, type Language, type TranslationKey } from '../i18n';
import type { Coordinate, OrderItem } from '../types';

type OrdersMapProps = {
  language: Language;
  orders: OrderItem[];
  userLocation: Coordinate;
  radiusMeters: number;
};

const PLATFORM_LOGO_DOMAINS: Record<string, string> = {
  Amazon: 'amazon.com',
  eMAG: 'emag.ro',
  Temu: 'temu.com',
  AliExpress: 'aliexpress.com',
  SHEIN: 'shein.com',
  'Fashion Days': 'fashiondays.ro',
};

function latitudeDeltaForRadius(radiusMeters: number): number {
  return Math.max(0.01, (radiusMeters / 111_320) * 2.4);
}

function longitudeDeltaForRadius(radiusMeters: number, latitude: number): number {
  const metersPerDegree = 111_320 * Math.cos((latitude * Math.PI) / 180);
  return Math.max(0.01, (radiusMeters / Math.max(metersPerDegree, 1)) * 2.4);
}

function platformInitials(platform: string): string {
  return platform
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function PlatformLogo({ platform }: { platform: string }) {
  const domain = PLATFORM_LOGO_DOMAINS[platform];
  if (!domain) {
    return (
      <View style={styles.logoFallback}>
        <Text style={styles.logoFallbackText}>{platformInitials(platform) || '?'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
      style={styles.platformLogo}
    />
  );
}

export function OrdersMap({ language, orders, userLocation, radiusMeters }: OrdersMapProps) {
  const t = (key: TranslationKey) => translate(language, key);
  const region = {
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    latitudeDelta: latitudeDeltaForRadius(radiusMeters),
    longitudeDelta: longitudeDeltaForRadius(radiusMeters, userLocation.latitude),
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('nearbyOrdersMap')}</Text>
        <Text style={styles.radiusText}>{formatDistance(radiusMeters)}</Text>
      </View>
      <MapView style={styles.map} initialRegion={region} showsUserLocation showsMyLocationButton>
        {orders.map((order) => (
          <Marker
            key={order.id}
            coordinate={{ latitude: order.latitude, longitude: order.longitude }}
            title={order.platform}
            description={`${t('participants')}: ${order.current_people}/${order.min_people}`}
          >
            <View style={styles.markerWrap}>
              <PlatformLogo platform={order.platform} />
              <Text style={styles.markerLabel} numberOfLines={1}>
                {order.platform}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    backgroundColor: '#0b1220',
    padding: 10,
    gap: 8,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  radiusText: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '800',
  },
  map: {
    height: 360,
    borderRadius: 10,
  },
  markerWrap: {
    alignItems: 'center',
    gap: 3,
  },
  platformLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#65a30d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#d9f99d',
    fontSize: 10,
    fontWeight: '900',
  },
  markerLabel: {
    maxWidth: 76,
    color: '#e2e8f0',
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
