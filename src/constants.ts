import { Platform } from 'react-native';

export const DEFAULT_PLATFORMS = ['Amazon', 'eMAG', 'Temu', 'AliExpress', 'SHEIN', 'Fashion Days'] as const;
export const RADIUS_OPTIONS = [50, 100, 250, 500, 1000, 2000, 3000];
export const MIN_PEOPLE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
export const WAIT_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const ALL_PLATFORMS = 'Toate platformele';

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(
  /\/$/,
  '',
);

export const MAX_PRODUCT_LINK_SLOTS = 10;
export const JOIN_RESERVATION_MINUTES = 10;
