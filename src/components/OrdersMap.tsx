import { Image, StyleSheet, Text, View } from 'react-native';

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

function metersOffsetFrom(origin: Coordinate, target: Coordinate): { x: number; y: number } {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (target.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (target.latitude - origin.latitude) * metersPerDegreeLatitude,
  };
}

function markerPosition(offsetMeters: { x: number; y: number }, radiusMeters: number): { left: `${number}%`; top: `${number}%` } {
  const usablePercent = 42;
  const safeRadius = Math.max(radiusMeters, 50);
  const left = Math.max(6, Math.min(94, 50 + (offsetMeters.x / safeRadius) * usablePercent));
  const top = Math.max(6, Math.min(94, 50 - (offsetMeters.y / safeRadius) * usablePercent));
  return { left: `${left}%`, top: `${top}%` };
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

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('nearbyOrdersMap')}</Text>
        <Text style={styles.radiusText}>{formatDistance(radiusMeters)}</Text>
      </View>
      <View style={styles.mapCanvas}>
        <View style={styles.gridVertical} />
        <View style={styles.gridHorizontal} />
        <View style={styles.radiusRingOuter} />
        <View style={styles.radiusRingInner} />

        <View style={styles.userMarker}>
          <Text style={styles.userMarkerText}>{t('youAreHere')}</Text>
        </View>

        {orders.map((order) => {
          const offset = metersOffsetFrom(userLocation, {
            latitude: order.latitude,
            longitude: order.longitude,
          });
          const position = markerPosition(offset, radiusMeters);
          return (
            <View key={order.id} style={[styles.orderMarker, position]}>
              <PlatformLogo platform={order.platform} />
              <Text style={styles.markerLabel} numberOfLines={1}>
                {order.platform}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('mapHint')}</Text>
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
  mapCanvas: {
    height: 320,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  gridVertical: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#243244',
  },
  gridHorizontal: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#243244',
  },
  radiusRingOuter: {
    position: 'absolute',
    left: '8%',
    top: '8%',
    width: '84%',
    height: '84%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  radiusRingInner: {
    position: 'absolute',
    left: '28%',
    top: '28%',
    width: '44%',
    height: '44%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f3a2b',
  },
  userMarker: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -24 }, { translateY: -14 }],
    minWidth: 48,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#65a30d',
    alignItems: 'center',
  },
  userMarkerText: {
    color: '#f7fee7',
    fontSize: 10,
    fontWeight: '900',
  },
  orderMarker: {
    position: 'absolute',
    transform: [{ translateX: -24 }, { translateY: -28 }],
    width: 48,
    alignItems: 'center',
    gap: 3,
  },
  platformLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#86efac',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#d9f99d',
    fontSize: 10,
    fontWeight: '900',
  },
  markerLabel: {
    maxWidth: 72,
    color: '#e2e8f0',
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 11,
  },
});
