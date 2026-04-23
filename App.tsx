import * as Google from 'expo-auth-session/providers/google';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const DEFAULT_PLATFORMS = ['Amazon', 'eMAG', 'Temu', 'AliExpress', 'SHEIN', 'Fashion Days'] as const;
const RADIUS_OPTIONS = [50, 100, 250, 500, 1000, 2000, 3000];
const MIN_PEOPLE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const WAIT_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ALL_PLATFORMS = 'Toate platformele';

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(
  /\/$/,
  '',
);
const MAX_PRODUCT_LINK_SLOTS = 10;
const JOIN_RESERVATION_MINUTES = 10;

type Tab = 'home' | 'create' | 'nearby';
type Coordinate = { latitude: number; longitude: number };
type ApiStatus = 'checking' | 'online' | 'offline';
type AuthMode = 'login' | 'register';
type AuthProvider = 'email' | 'google';

type User = {
  id: string;
  email: string;
  display_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
};

type AuthResponse = {
  token: string;
  user: User;
};

type OrderItem = {
  id: string;
  platform: string;
  min_people: number;
  current_people: number;
  created_by: string;
  max_wait_days: number;
  expires_at: string;
  status: 'open' | 'expired' | 'closed';
  extended_once: boolean;
  created_at: string;
  latitude: number;
  longitude: number;
  distance_meters: number | null;
  reserved_people: number;
  available_slots: number;
  join_state: 'none' | 'reserved' | 'joined';
  my_reservation_expires_at: string | null;
  priority_score: number | null;
};

type ProductLinkItem = {
  id: string;
  order_id: string;
  user_name: string;
  url: string;
  processed: boolean;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
};

type ProductLinksResponse = {
  items: ProductLinkItem[];
  slots_used: number;
  slots_max: number;
};

type NotificationItem = {
  id: string;
  event_type: string;
  title: string;
  message: string;
  related_order_id: string | null;
  created_at: string;
  read: boolean;
};

type NotificationsResponse = {
  items: NotificationItem[];
  unread_count: number;
};

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function labelRadius(radius: number): string {
  return radius < 1000 ? `${radius}m` : `${radius / 1000}km`;
}

function timeLeftLabel(expiresAtIso: string): string {
  const now = Date.now();
  const expires = new Date(expiresAtIso).getTime();
  const diffMs = expires - now;
  if (diffMs <= 0) {
    return 'expirata';
  }
  const totalHours = Math.ceil(diffMs / 3600000);
  if (totalHours < 24) {
    return `${totalHours} h ramase`;
  }
  const days = Math.ceil(totalHours / 24);
  return `${days} zile ramase`;
}

function reservationTimeLeftLabel(expiresAtIso: string | null): string {
  if (!expiresAtIso) {
    return '';
  }
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return 'expirat';
  }
  const totalMinutes = Math.ceil(diffMs / 60000);
  return `${totalMinutes} min`;
}

function notificationTimeLabel(createdAtIso: string): string {
  const diffMs = Date.now() - new Date(createdAtIso).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'acum';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h`;
  }
  return `${Math.floor(diffHours / 24)} zile`;
}

function statusLabel(status: OrderItem['status']): string {
  if (status === 'open') {
    return 'Activa';
  }
  if (status === 'expired') {
    return 'Expirata';
  }
  return 'Inchisa';
}

function formatAddressFromGeocode(address: Location.LocationGeocodedAddress): string {
  const parts = [
    address.street,
    address.streetNumber,
    address.district,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].filter(Boolean);
  return parts.join(', ');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

type RadiusBarSelectorProps = {
  value: number;
  onChange: (value: number) => void;
};

function RadiusBarSelector({ value, onChange }: RadiusBarSelectorProps) {
  const selectedIndex = Math.max(RADIUS_OPTIONS.indexOf(value), 0);
  const progressPercent =
    RADIUS_OPTIONS.length <= 1 ? 100 : (selectedIndex / (RADIUS_OPTIONS.length - 1)) * 100;

  return (
    <View style={styles.radiusBarWrapper}>
      <View style={styles.radiusTrackArea}>
        <View style={styles.radiusTrackRail}>
          <View style={styles.radiusTrackBase} />
          <View style={[styles.radiusTrackFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.radiusStepsRow}>
          {RADIUS_OPTIONS.map((radius, index) => {
            const isSelected = index === selectedIndex;
            const isReached = index <= selectedIndex;

            return (
              <Pressable key={radius} onPress={() => onChange(radius)} style={styles.radiusStep} hitSlop={8}>
                <View
                  style={[
                    styles.radiusDot,
                    isReached && styles.radiusDotReached,
                    isSelected && styles.radiusDotSelected,
                  ]}
                />
                <Text style={[styles.radiusLabel, isSelected && styles.radiusLabelSelected]}>
                  {labelRadius(radius)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.radiusValueText}>Selectat: {formatDistance(value)}</Text>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [locationState, setLocationState] = useState<'loading' | 'granted' | 'fallback'>('loading');
  const [myLocation, setMyLocation] = useState<Coordinate | null>(null);
  const [detectedAddress, setDetectedAddress] = useState('');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [platforms, setPlatforms] = useState<string[]>([...DEFAULT_PLATFORMS]);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authProvider, setAuthProvider] = useState<AuthProvider>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [selectedPlatform, setSelectedPlatform] = useState<string>('Amazon');
  const [selectedRadius, setSelectedRadius] = useState<number>(500);
  const [selectedMinPeople, setSelectedMinPeople] = useState<number>(2);
  const [selectedWaitDays, setSelectedWaitDays] = useState<number>(1);

  const [nearbyRadiusFilter, setNearbyRadiusFilter] = useState<number>(1000);
  const [nearbyPlatformFilter, setNearbyPlatformFilter] = useState<string>(ALL_PLATFORMS);

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [myOrders, setMyOrders] = useState<OrderItem[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingMyOrders, setIsLoadingMyOrders] = useState(false);
  const [joinedOrderIds, setJoinedOrderIds] = useState<Set<string>>(new Set());
  const [expandedLinksOrderIds, setExpandedLinksOrderIds] = useState<Set<string>>(new Set());
  const [orderLinksByOrderId, setOrderLinksByOrderId] = useState<Record<string, ProductLinkItem[]>>({});
  const [orderLinkDraftByOrderId, setOrderLinkDraftByOrderId] = useState<Record<string, string>>({});
  const [loadingLinksByOrderId, setLoadingLinksByOrderId] = useState<Record<string, boolean>>({});
  const [slotsUsedByOrderId, setSlotsUsedByOrderId] = useState<Record<string, number>>({});
  const [reservedOrderExpiresById, setReservedOrderExpiresById] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? '';
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';
  const googleExpoClientId = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID?.trim() ?? '';

  const requiredGoogleEnvVar = useMemo(() => {
    if (Platform.OS === 'android') {
      return 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
    }
    if (Platform.OS === 'ios') {
      return 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID';
    }
    return 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
  }, []);

  const googleEnabled = useMemo(() => {
    if (Platform.OS === 'android') {
      return Boolean(googleAndroidClientId);
    }
    if (Platform.OS === 'ios') {
      return Boolean(googleIosClientId);
    }
    return Boolean(googleWebClientId || googleExpoClientId);
  }, [googleAndroidClientId, googleIosClientId, googleWebClientId, googleExpoClientId]);

  const [googleRequest, googleResponse, promptGoogleAuth] = Google.useAuthRequest({
    // Keep hook stable even when env vars are missing; login button stays disabled until configured.
    androidClientId:
      googleAndroidClientId || '000000000000-android-placeholder.apps.googleusercontent.com',
    iosClientId: googleIosClientId || '000000000000-ios-placeholder.apps.googleusercontent.com',
    webClientId: googleWebClientId || '000000000000-web-placeholder.apps.googleusercontent.com',
    clientId:
      googleExpoClientId ||
      googleWebClientId ||
      '000000000000-expo-placeholder.apps.googleusercontent.com',
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    let cancelled = false;

    async function loadLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          if (!cancelled) {
            setMyLocation({ latitude: 44.4268, longitude: 26.1025 });
            setLocationState('fallback');
          }
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setMyLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
          setLocationState('granted');
        }
      } catch {
        if (!cancelled) {
          setMyLocation({ latitude: 44.4268, longitude: 26.1025 });
          setLocationState('fallback');
        }
      }
    }

    loadLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!myLocation) {
      return;
    }
    const location = myLocation;

    async function resolveAddress() {
      setIsResolvingAddress(true);
      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: location.latitude,
          longitude: location.longitude,
        });
        if (!cancelled) {
          if (geocoded.length > 0) {
            const formatted = formatAddressFromGeocode(geocoded[0]);
            setDetectedAddress(
              formatted || `Lat ${location.latitude.toFixed(5)}, Lon ${location.longitude.toFixed(5)}`,
            );
          } else {
            setDetectedAddress(`Lat ${location.latitude.toFixed(5)}, Lon ${location.longitude.toFixed(5)}`);
          }
        }
      } catch {
        if (!cancelled) {
          setDetectedAddress(`Lat ${location.latitude.toFixed(5)}, Lon ${location.longitude.toFixed(5)}`);
        }
      } finally {
        if (!cancelled) {
          setIsResolvingAddress(false);
        }
      }
    }

    resolveAddress();
    return () => {
      cancelled = true;
    };
  }, [myLocation]);

  const checkBackend = useCallback(async () => {
    try {
      await fetchJson<{ status: string }>(`${API_BASE_URL}/health`);
      setApiStatus('online');

      const result = await fetchJson<{ items: string[] }>(`${API_BASE_URL}/platforms`);
      if (result.items.length > 0) {
        setPlatforms(result.items);
        if (!result.items.includes(selectedPlatform)) {
          setSelectedPlatform(result.items[0]);
        }
      }
    } catch {
      setApiStatus('offline');
    }
  }, [selectedPlatform]);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!authToken) {
      return {};
    }
    return { Authorization: `Bearer ${authToken}` };
  }, [authToken]);

  const loadNearbyOrders = useCallback(async () => {
    if (!myLocation || apiStatus !== 'online' || !authToken) {
      return;
    }

    setIsLoadingOrders(true);
    try {
      const params = new URLSearchParams({
        latitude: String(myLocation.latitude),
        longitude: String(myLocation.longitude),
        radius_meters: String(nearbyRadiusFilter),
      });
      if (nearbyPlatformFilter !== ALL_PLATFORMS) {
        params.set('platform', nearbyPlatformFilter);
      }

      const result = await fetchJson<{ items: OrderItem[] }>(
        `${API_BASE_URL}/orders/nearby?${params.toString()}`,
        { headers: { ...authHeaders() } },
      );
      setOrders(result.items);
      setJoinedOrderIds(new Set(result.items.filter((item) => item.join_state === 'joined').map((item) => item.id)));
      const reservedMap: Record<string, string> = {};
      for (const item of result.items) {
        if (item.join_state === 'reserved' && item.my_reservation_expires_at) {
          reservedMap[item.id] = item.my_reservation_expires_at;
        }
      }
      setReservedOrderExpiresById(reservedMap);
    } catch {
      Alert.alert('Eroare', 'Nu am putut incarca comenzile din apropiere.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, [apiStatus, authHeaders, authToken, myLocation, nearbyPlatformFilter, nearbyRadiusFilter]);

  const loadMyOrders = useCallback(async () => {
    if (apiStatus !== 'online' || !authToken) {
      return;
    }

    setIsLoadingMyOrders(true);
    try {
      const result = await fetchJson<{ items: OrderItem[] }>(`${API_BASE_URL}/orders/mine`, {
        headers: { ...authHeaders() },
      });
      setMyOrders(result.items);
    } catch {
      Alert.alert('Eroare', 'Nu am putut incarca comenzile tale.');
    } finally {
      setIsLoadingMyOrders(false);
    }
  }, [apiStatus, authHeaders, authToken]);

  const loadNotifications = useCallback(async () => {
    if (apiStatus !== 'online' || !authToken) {
      return;
    }

    setIsLoadingNotifications(true);
    try {
      const result = await fetchJson<NotificationsResponse>(`${API_BASE_URL}/notifications?limit=20`, {
        headers: { ...authHeaders() },
      });
      setNotifications(result.items);
      setUnreadNotificationsCount(result.unread_count);
    } catch {
      // Keep silent here to avoid noisy alerts during background polling.
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [apiStatus, authHeaders, authToken]);

  useEffect(() => {
    if (authToken) {
      loadNearbyOrders();
      loadMyOrders();
      loadNotifications();
    }
  }, [authToken, loadMyOrders, loadNearbyOrders, loadNotifications]);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    const timer = setInterval(() => {
      void loadNotifications();
    }, 20000);
    return () => clearInterval(timer);
  }, [authToken, loadNotifications]);

  async function submitEmailAuth() {
    if (apiStatus !== 'online') {
      Alert.alert('Backend offline', 'Porneste backend-ul Python inainte de autentificare.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      Alert.alert('Date incomplete', 'Completeaza email si parola.');
      return;
    }
    if (authMode === 'register' && displayName.trim().length < 2) {
      Alert.alert('Date incomplete', 'Alege un nume de minim 2 caractere.');
      return;
    }
    if (authMode === 'register' && phone.trim().length < 7) {
      Alert.alert('Date incomplete', 'Introdu numarul de telefon.');
      return;
    }
    if (authMode === 'register' && !myLocation) {
      Alert.alert('Locatie indisponibila', 'Nu am putut detecta geolocatia pentru adresa.');
      return;
    }

    setIsAuthSubmitting(true);
    try {
      const payload =
        authMode === 'register'
          ? {
              email: email.trim(),
              password: password.trim(),
              display_name: displayName.trim(),
              phone: phone.trim(),
              address: detectedAddress || `Lat ${myLocation?.latitude ?? 0}, Lon ${myLocation?.longitude ?? 0}`,
              latitude: myLocation?.latitude ?? 0,
              longitude: myLocation?.longitude ?? 0,
            }
          : {
              email: email.trim(),
              password: password.trim(),
            };

      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      const result = await fetchJson<AuthResponse>(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setAuthToken(result.token);
      setCurrentUser(result.user);
      setActiveTab('home');
      setEmail('');
      setPassword('');
      setDisplayName('');
      setPhone('');
    } catch (error) {
      Alert.alert('Autentificare esuata', error instanceof Error ? error.message : 'Eroare necunoscuta');
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  const submitGoogleAuth = useCallback(
    async (accessToken: string) => {
      if (apiStatus !== 'online') {
        Alert.alert('Backend offline', 'Porneste backend-ul Python inainte de autentificare.');
        return;
      }
      if (!myLocation) {
        Alert.alert('Locatie indisponibila', 'Nu am putut detecta geolocatia pentru adresa.');
        return;
      }
      if (phone.trim().length < 7) {
        Alert.alert('Date incomplete', 'Introdu numarul de telefon pentru profil.');
        return;
      }

      setIsAuthSubmitting(true);
      try {
        const result = await fetchJson<AuthResponse>(`${API_BASE_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            phone: phone.trim(),
            address: detectedAddress || `Lat ${myLocation.latitude}, Lon ${myLocation.longitude}`,
            latitude: myLocation.latitude,
            longitude: myLocation.longitude,
          }),
        });
        setAuthToken(result.token);
        setCurrentUser(result.user);
        setActiveTab('home');
        setPhone('');
      } catch (error) {
        Alert.alert('Login Google esuat', error instanceof Error ? error.message : 'Eroare necunoscuta');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [apiStatus, detectedAddress, myLocation, phone],
  );

  useEffect(() => {
    if (!googleResponse || googleResponse.type !== 'success') {
      return;
    }
    const accessToken =
      googleResponse.authentication?.accessToken ??
      (typeof googleResponse.params?.access_token === 'string'
        ? googleResponse.params.access_token
        : null);
    if (!accessToken) {
      Alert.alert('Google', 'Nu am primit token de la Google.');
      return;
    }
    void submitGoogleAuth(accessToken);
  }, [googleResponse, submitGoogleAuth]);

  async function startGoogleLogin() {
    if (!googleEnabled) {
      Alert.alert(
        'Google neconfigurat',
        `Seteaza ${requiredGoogleEnvVar} pentru a activa login-ul Google pe aceasta platforma.`,
      );
      return;
    }
    if (!googleRequest) {
      Alert.alert('Google', 'Fluxul Google inca se initializeaza.');
      return;
    }
    await promptGoogleAuth();
  }

  function logout() {
    setAuthToken(null);
    setCurrentUser(null);
    setOrders([]);
    setMyOrders([]);
    setJoinedOrderIds(new Set());
    setExpandedLinksOrderIds(new Set());
    setOrderLinksByOrderId({});
    setOrderLinkDraftByOrderId({});
    setLoadingLinksByOrderId({});
    setSlotsUsedByOrderId({});
    setReservedOrderExpiresById({});
    setNotifications([]);
    setUnreadNotificationsCount(0);
    setActiveTab('home');
  }

  async function createOrder() {
    if (!myLocation) {
      Alert.alert('Locatie indisponibila', 'Nu am inca o locatie valida.');
      return;
    }
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', 'Trebuie sa fii logat si backend-ul sa fie pornit.');
      return;
    }

    try {
      await fetchJson<OrderItem>(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          platform: selectedPlatform,
          min_people: selectedMinPeople,
          max_wait_days: selectedWaitDays,
          latitude: myLocation.latitude,
          longitude: myLocation.longitude,
        }),
      });
      setActiveTab('nearby');
      setNearbyPlatformFilter(selectedPlatform);
      setNearbyRadiusFilter(selectedRadius);
      await Promise.all([loadNearbyOrders(), loadMyOrders(), loadNotifications()]);
      Alert.alert('Comanda creata', 'Comanda ta a fost publicata.');
    } catch {
      Alert.alert('Eroare', 'Nu am putut crea comanda.');
    }
  }

  async function markNotificationRead(notificationId: string) {
    if (apiStatus !== 'online' || !authToken) {
      return;
    }
    try {
      const result = await fetchJson<NotificationsResponse>(
        `${API_BASE_URL}/notifications/${notificationId}/read`,
        {
          method: 'POST',
          headers: { ...authHeaders() },
        },
      );
      setNotifications(result.items);
      setUnreadNotificationsCount(result.unread_count);
    } catch {
      Alert.alert('Notificari', 'Nu am putut marca notificarea ca citita.');
    }
  }

  async function joinOrder(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', 'Trebuie sa fii logat si backend-ul sa fie pornit.');
      return;
    }
    if (joinedOrderIds.has(orderId)) {
      return;
    }

    try {
      const result = await fetchJson<OrderItem>(`${API_BASE_URL}/orders/${orderId}/join`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      if (result.join_state === 'reserved') {
        if (result.my_reservation_expires_at) {
          setReservedOrderExpiresById((previous) => ({
            ...previous,
            [orderId]: result.my_reservation_expires_at as string,
          }));
        }
        Alert.alert(
          'Loc rezervat',
          `Ai rezervat un loc pentru ${JOIN_RESERVATION_MINUTES} minute. Apasa inca o data pentru confirmare.`,
        );
        await loadNearbyOrders();
        return;
      }

      setReservedOrderExpiresById((previous) => {
        const updated = { ...previous };
        delete updated[orderId];
        return updated;
      });
      setJoinedOrderIds((previous) => new Set([...previous, orderId]));
      setExpandedLinksOrderIds((previous) => new Set([...previous, orderId]));
      await Promise.all([loadOrderLinks(orderId), loadNearbyOrders(), loadMyOrders(), loadNotifications()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Order is full')) {
        Alert.alert('Comanda plina', 'Toate locurile din aceasta comanda sunt ocupate.');
        await loadNearbyOrders();
        return;
      }
      Alert.alert('Eroare', 'Nu am putut face join la comanda (poate a expirat).');
    }
  }

  async function loadOrderLinks(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      return;
    }
    setLoadingLinksByOrderId((previous) => ({ ...previous, [orderId]: true }));
    try {
      const result = await fetchJson<ProductLinksResponse>(`${API_BASE_URL}/orders/${orderId}/links`, {
        headers: { ...authHeaders() },
      });
      setOrderLinksByOrderId((previous) => ({ ...previous, [orderId]: result.items }));
      setSlotsUsedByOrderId((previous) => ({ ...previous, [orderId]: result.slots_used }));
    } catch {
      Alert.alert('Linkuri', 'Nu am putut incarca linkurile pentru aceasta comanda.');
    } finally {
      setLoadingLinksByOrderId((previous) => ({ ...previous, [orderId]: false }));
    }
  }

  async function addProductLink(orderId: string) {
    const draft = orderLinkDraftByOrderId[orderId]?.trim() ?? '';
    if (!draft) {
      Alert.alert('Link lipsa', 'Introdu un link de produs.');
      return;
    }
    const currentSlotsUsed = slotsUsedByOrderId[orderId] ?? 0;
    if (currentSlotsUsed >= MAX_PRODUCT_LINK_SLOTS) {
      Alert.alert('Limita atinsa', 'Poti adauga maximum 10 linkuri la aceasta comanda.');
      return;
    }

    try {
      const result = await fetchJson<ProductLinksResponse>(`${API_BASE_URL}/orders/${orderId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url: draft }),
      });
      setOrderLinksByOrderId((previous) => ({ ...previous, [orderId]: result.items }));
      setSlotsUsedByOrderId((previous) => ({ ...previous, [orderId]: result.slots_used }));
      setOrderLinkDraftByOrderId((previous) => ({ ...previous, [orderId]: '' }));
      void loadNotifications();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Maximum 10 product link slots reached')) {
        Alert.alert('Limita atinsa', 'Ai atins limita de 10 linkuri.');
        return;
      }
      if (message.includes('Invalid product URL')) {
        Alert.alert('URL invalid', 'Foloseste un link valid care incepe cu http:// sau https://');
        return;
      }
      Alert.alert('Eroare', 'Nu am putut salva linkul produsului.');
    }
  }

  function toggleOrderLinks(orderId: string) {
    const isOpen = expandedLinksOrderIds.has(orderId);
    if (isOpen) {
      setExpandedLinksOrderIds((previous) => {
        const updated = new Set(previous);
        updated.delete(orderId);
        return updated;
      });
      return;
    }
    setExpandedLinksOrderIds((previous) => {
      const updated = new Set(previous);
      updated.add(orderId);
      return updated;
    });
    if (!orderLinksByOrderId[orderId]) {
      void loadOrderLinks(orderId);
    }
  }

  async function openAndProcessLink(orderId: string, link: ProductLinkItem) {
    try {
      await Linking.openURL(link.url);
    } catch {
      Alert.alert('Link invalid', 'Nu am putut deschide linkul.');
      return;
    }

    try {
      const result = await fetchJson<ProductLinksResponse>(
        `${API_BASE_URL}/orders/${orderId}/links/${link.id}/process`,
        {
          method: 'POST',
          headers: { ...authHeaders() },
        },
      );
      setOrderLinksByOrderId((previous) => ({ ...previous, [orderId]: result.items }));
      setSlotsUsedByOrderId((previous) => ({ ...previous, [orderId]: result.slots_used }));
      void loadNotifications();
    } catch {
      Alert.alert('Procesare', 'Nu am putut marca linkul ca procesat.');
    }
  }

  async function extendOrder(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', 'Trebuie sa fii logat si backend-ul sa fie pornit.');
      return;
    }

    try {
      await fetchJson<OrderItem>(`${API_BASE_URL}/orders/${orderId}/extend`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      await Promise.all([loadNearbyOrders(), loadMyOrders(), loadNotifications()]);
      Alert.alert('Comanda prelungita', 'Comanda a fost prelungita o singura data cu 10 zile.');
    } catch {
      Alert.alert('Nu se poate prelungi', 'Comanda trebuie sa fie expirata si neprelungita anterior.');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>CartBuddy</Text>
        <Text style={styles.subtitle}>Comenzi comune locale pentru cost mai mic la livrare.</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.infoText}>API: {API_BASE_URL}</Text>
        <Text style={[styles.infoText, apiStatus === 'online' ? styles.online : styles.offline]}>
          {apiStatus === 'online'
            ? 'online'
            : apiStatus === 'offline'
              ? 'offline'
              : 'checking'}
        </Text>
      </View>

      {currentUser && (
        <View style={styles.userRow}>
          <Text style={styles.userText}>Logat: {currentUser.display_name}</Text>
          <View style={styles.userActionsRow}>
            <Text style={styles.headerNotifBadge}>{unreadNotificationsCount} notif</Text>
            <Pressable onPress={logout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      )}

      {activeTab !== 'home' && currentUser && (
        <View style={styles.topNav}>
          <Pressable onPress={() => setActiveTab('home')} style={styles.backButton}>
            <Text style={styles.backButtonText}>Inapoi la Home</Text>
          </Pressable>
        </View>
      )}

      {locationState === 'loading' && (
        <View style={styles.locationNotice}>
          <ActivityIndicator color="#84cc16" />
          <Text style={styles.noticeText}>Determin locatia...</Text>
        </View>
      )}

      {locationState === 'fallback' && (
        <View style={styles.locationWarning}>
          <Text style={styles.warningText}>
            Folosesc locatie demo (Bucuresti) deoarece permisiunea GPS lipseste.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {!currentUser ? (
          <View style={styles.authCard}>
            <Text style={styles.sectionTitle}>Autentificare</Text>

            <View style={styles.authProviderRow}>
              <Pressable
                onPress={() => setAuthProvider('email')}
                style={[
                  styles.authProviderButton,
                  authProvider === 'email' && styles.authProviderButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.authProviderText,
                    authProvider === 'email' && styles.authProviderTextActive,
                  ]}
                >
                  Email
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAuthProvider('google')}
                style={[
                  styles.authProviderButton,
                  authProvider === 'google' && styles.authProviderButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.authProviderText,
                    authProvider === 'google' && styles.authProviderTextActive,
                  ]}
                >
                  Google
                </Text>
              </Pressable>
            </View>

            {authProvider === 'email' ? (
              <>
                <View style={styles.authModeRow}>
                  <Pressable
                    onPress={() => setAuthMode('login')}
                    style={[styles.authModeButton, authMode === 'login' && styles.authModeButtonActive]}
                  >
                    <Text style={[styles.authModeText, authMode === 'login' && styles.authModeTextActive]}>
                      Login
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAuthMode('register')}
                    style={[styles.authModeButton, authMode === 'register' && styles.authModeButtonActive]}
                  >
                    <Text style={[styles.authModeText, authMode === 'register' && styles.authModeTextActive]}>
                      Register
                    </Text>
                  </Pressable>
                </View>

                {authMode === 'register' && (
                  <>
                    <TextInput
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Nume"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      autoCapitalize="words"
                    />
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Numar telefon"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      keyboardType="phone-pad"
                    />
                    <View style={styles.addressBox}>
                      <Text style={styles.addressTitle}>Adresa detectata prin geolocatie</Text>
                      <Text style={styles.addressText}>
                        {isResolvingAddress ? 'Se detecteaza adresa...' : detectedAddress || 'Nedisponibila'}
                      </Text>
                    </View>
                  </>
                )}

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Parola"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  secureTextEntry
                />

                <Pressable onPress={submitEmailAuth} style={styles.primaryButton} disabled={isAuthSubmitting}>
                  <Text style={styles.primaryButtonText}>
                    {isAuthSubmitting
                      ? 'Se proceseaza...'
                      : authMode === 'login'
                        ? 'Intra in cont'
                        : 'Creeaza cont'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Numar telefon (obligatoriu)"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  keyboardType="phone-pad"
                />
                <View style={styles.addressBox}>
                  <Text style={styles.addressTitle}>Adresa detectata prin geolocatie</Text>
                  <Text style={styles.addressText}>
                    {isResolvingAddress ? 'Se detecteaza adresa...' : detectedAddress || 'Nedisponibila'}
                  </Text>
                </View>

                <Pressable
                  onPress={startGoogleLogin}
                  style={styles.googleButton}
                  disabled={isAuthSubmitting || !googleRequest || !googleEnabled}
                >
                  <Text style={styles.googleButtonText}>
                    {isAuthSubmitting ? 'Se proceseaza...' : 'Continua cu Google'}
                  </Text>
                </Pressable>
                {!googleEnabled && (
                  <Text style={styles.smallNote}>
                    {`Pentru Google login seteaza ${requiredGoogleEnvVar}.`}
                  </Text>
                )}
              </>
            )}
          </View>
        ) : activeTab === 'home' ? (
          <View style={styles.homeCard}>
            <Text style={styles.homeTitle}>Home</Text>
            <Text style={styles.homeSubtitle}>Alege ce vrei sa faci:</Text>

            <Pressable onPress={() => setActiveTab('nearby')} style={styles.homeActionPrimary}>
              <Text style={styles.homeActionPrimaryText}>Cauta comenzi</Text>
            </Pressable>

            <Pressable onPress={() => setActiveTab('create')} style={styles.homeActionSecondary}>
              <Text style={styles.homeActionSecondaryText}>Plaseaza o comanda</Text>
            </Pressable>

            <View style={styles.notificationsCard}>
              <View style={styles.notificationsHeader}>
                <Text style={styles.notificationsTitle}>Notificari</Text>
                <View style={styles.notificationsHeaderActions}>
                  <Text style={styles.notificationsBadge}>{unreadNotificationsCount} necitite</Text>
                  <Pressable onPress={loadNotifications}>
                    <Text style={styles.inlineAction}>Refresh</Text>
                  </Pressable>
                </View>
              </View>
              {isLoadingNotifications ? (
                <ActivityIndicator color="#84cc16" />
              ) : notifications.length === 0 ? (
                <Text style={styles.emptyState}>Nu ai notificari momentan.</Text>
              ) : (
                notifications.slice(0, 5).map((notification) => (
                  <View key={notification.id} style={styles.notificationRow}>
                    <View style={styles.notificationTextWrap}>
                      <Text style={styles.notificationTitleText}>{notification.title}</Text>
                      <Text style={styles.notificationMessageText}>{notification.message}</Text>
                      <Text style={styles.notificationTimeText}>
                        {notificationTimeLabel(notification.created_at)}
                      </Text>
                    </View>
                    {!notification.read && (
                      <Pressable
                        onPress={() => markNotificationRead(notification.id)}
                        style={styles.notificationReadButton}
                      >
                        <Text style={styles.notificationReadButtonText}>Citit</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        ) : activeTab === 'create' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1) Alege platforma</Text>
            <View style={styles.chipWrap}>
              {platforms.map((platform) => (
                <Pressable
                  key={platform}
                  onPress={() => setSelectedPlatform(platform)}
                  style={[styles.chip, selectedPlatform === platform && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selectedPlatform === platform && styles.chipTextSelected]}>
                    {platform}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>2) Perioada maxima de asteptare (1-10 zile)</Text>
            <View style={styles.chipWrap}>
              {WAIT_DAYS_OPTIONS.map((days) => (
                <Pressable
                  key={days}
                  onPress={() => setSelectedWaitDays(days)}
                  style={[styles.chip, selectedWaitDays === days && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selectedWaitDays === days && styles.chipTextSelected]}>
                    {days}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>3) Numar minim buddy (2-10)</Text>
            <View style={styles.chipWrap}>
              {MIN_PEOPLE_OPTIONS.map((people) => (
                <Pressable
                  key={people}
                  onPress={() => setSelectedMinPeople(people)}
                  style={[styles.chip, selectedMinPeople === people && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selectedMinPeople === people && styles.chipTextSelected]}>
                    {people}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>4) Raza recomandata pentru matching</Text>
            <RadiusBarSelector value={selectedRadius} onChange={setSelectedRadius} />

            <Pressable onPress={createOrder} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Publica comanda</Text>
            </Pressable>

            <View style={styles.myOrdersHeader}>
              <Text style={styles.sectionTitle}>Comenzile mele</Text>
              <Pressable onPress={loadMyOrders}>
                <Text style={styles.inlineAction}>Refresh</Text>
              </Pressable>
            </View>

            {isLoadingMyOrders ? (
              <ActivityIndicator color="#84cc16" />
            ) : myOrders.length === 0 ? (
              <Text style={styles.emptyState}>Nu ai comenzi create momentan.</Text>
            ) : (
              <View style={styles.ordersSection}>
                {myOrders.map((order) => {
                  const canExtend = order.status === 'expired' && !order.extended_once;
                  return (
                    <View key={order.id} style={styles.orderCard}>
                      <Text style={styles.orderTitle}>{order.platform}</Text>
                      <Text style={styles.orderMeta}>Status: {statusLabel(order.status)}</Text>
                      <Text style={styles.orderMeta}>
                        Participanti: {order.current_people}/{order.min_people}
                      </Text>
                      <Text style={styles.orderMeta}>Interval: {order.max_wait_days} zile</Text>
                      <Text style={styles.orderMeta}>Timp ramas: {timeLeftLabel(order.expires_at)}</Text>
                      <Text style={styles.orderMeta}>
                        Prelungire folosita: {order.extended_once ? 'Da' : 'Nu'}
                      </Text>

                      {canExtend && (
                        <Pressable onPress={() => extendOrder(order.id)} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Prelungeste cu 10 zile</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Filtre</Text>
            <View style={styles.chipWrap}>
              <Pressable
                key={ALL_PLATFORMS}
                onPress={() => setNearbyPlatformFilter(ALL_PLATFORMS)}
                style={[
                  styles.chip,
                  nearbyPlatformFilter === ALL_PLATFORMS && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    nearbyPlatformFilter === ALL_PLATFORMS && styles.chipTextSelected,
                  ]}
                >
                  {ALL_PLATFORMS}
                </Text>
              </Pressable>
              {platforms.map((platform) => (
                <Pressable
                  key={platform}
                  onPress={() => setNearbyPlatformFilter(platform)}
                  style={[styles.chip, nearbyPlatformFilter === platform && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      nearbyPlatformFilter === platform && styles.chipTextSelected,
                    ]}
                  >
                    {platform}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Raza cautare</Text>
            <RadiusBarSelector value={nearbyRadiusFilter} onChange={setNearbyRadiusFilter} />
            <Text style={styles.smallNote}>
              Sortare inteligenta activa: distanta + locuri disponibile + timp ramas.
            </Text>

            <Pressable onPress={loadNearbyOrders} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </Pressable>

            <View style={styles.ordersSection}>
              {isLoadingOrders ? (
                <ActivityIndicator color="#84cc16" />
              ) : orders.length === 0 ? (
                <Text style={styles.emptyState}>
                  Nu exista comenzi in raza selectata sau comenzile au expirat.
                </Text>
              ) : (
                orders.map((order) => {
                  const effectivePeople = order.current_people + order.reserved_people;
                  const reachedMin = effectivePeople >= order.min_people;
                  const isJoined = joinedOrderIds.has(order.id) || order.join_state === 'joined';
                  const isOwnOrder = currentUser.display_name === order.created_by;
                  const orderReservation = reservedOrderExpiresById[order.id] ?? order.my_reservation_expires_at;
                  const isReservationActive = orderReservation
                    ? new Date(orderReservation).getTime() > Date.now()
                    : false;
                  const isReserved = !isJoined && !isOwnOrder && isReservationActive;
                  const isOrderFull = order.available_slots <= 0;
                  const canJoin = !isOwnOrder && !isJoined && !isOrderFull;
                  const isLinksOpen = expandedLinksOrderIds.has(order.id);
                  const currentLinks = orderLinksByOrderId[order.id] ?? [];
                  const slotsUsedForCurrentUser = slotsUsedByOrderId[order.id] ?? 0;
                  const slotsLeftForLinks = Math.max(MAX_PRODUCT_LINK_SLOTS - slotsUsedForCurrentUser, 0);
                  const canManageLinks = isOwnOrder || isJoined;
                  const matchPercent =
                    order.priority_score === null
                      ? null
                      : Math.max(1, Math.min(99, Math.round((1 - order.priority_score) * 100)));

                  return (
                    <View key={order.id} style={styles.orderCard}>
                      <Text style={styles.orderTitle}>{order.platform}</Text>
                      <Text style={styles.orderMeta}>Initiata de: {order.created_by}</Text>
                      {matchPercent !== null && (
                        <Text style={styles.orderMeta}>Scor matching: {matchPercent}%</Text>
                      )}
                      <Text style={styles.orderMeta}>
                        Distanta:{' '}
                        {order.distance_meters === null
                          ? '-'
                          : formatDistance(order.distance_meters)}
                      </Text>
                      <Text style={styles.orderMeta}>
                        Participanti confirmati: {order.current_people}/{order.min_people}
                      </Text>
                      <Text style={styles.orderMeta}>Rezervari active: {order.reserved_people}</Text>
                      <Text style={styles.orderMeta}>
                        Locuri disponibile: {order.available_slots}
                      </Text>
                      <Text style={styles.orderMeta}>Timp ramas: {timeLeftLabel(order.expires_at)}</Text>
                      {isReserved && (
                        <Text style={styles.orderMeta}>
                          Locul tau este rezervat: {reservationTimeLeftLabel(orderReservation)}
                        </Text>
                      )}

                      <Text style={[styles.statusTag, reachedMin ? styles.statusOk : styles.statusWait]}>
                        {reachedMin ? 'Pragul minim este atins' : 'Inca se cauta participanti'}
                      </Text>

                      <Pressable
                        onPress={() => joinOrder(order.id)}
                        style={[
                          styles.secondaryButton,
                          (!canJoin) && styles.disabledButton,
                        ]}
                        disabled={!canJoin}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {isOwnOrder
                            ? 'Comanda ta'
                            : isJoined
                              ? 'Te-ai alaturat'
                              : isReserved
                                ? `Confirma in ${reservationTimeLeftLabel(orderReservation)}`
                              : isOrderFull
                                ? 'Nu mai sunt locuri'
                              : `Rezerva loc (${JOIN_RESERVATION_MINUTES} min)`}
                        </Text>
                      </Pressable>

                      {canManageLinks && (
                        <View style={styles.linksCard}>
                          <Pressable onPress={() => toggleOrderLinks(order.id)} style={styles.linksToggleButton}>
                            <Text style={styles.linksToggleText}>
                              {isLinksOpen ? 'Ascunde linkuri' : 'Gestioneaza linkuri produse'}
                            </Text>
                          </Pressable>

                          {isLinksOpen && (
                            <View style={styles.linksBody}>
                              <Text style={styles.orderMeta}>
                                Sloturi folosite: {slotsUsedForCurrentUser}/{MAX_PRODUCT_LINK_SLOTS}
                              </Text>
                              {loadingLinksByOrderId[order.id] ? (
                                <ActivityIndicator color="#84cc16" />
                              ) : currentLinks.length === 0 ? (
                                <Text style={styles.emptyState}>
                                  Nu ai adaugat linkuri inca. Ai un slot disponibil acum.
                                </Text>
                              ) : (
                                currentLinks.map((link, idx) => (
                                  <View key={link.id} style={styles.linkItemRow}>
                                    <View style={styles.linkItemContent}>
                                      <Text style={styles.linkItemText}>
                                        {idx + 1}. [{link.user_name}] {link.url}
                                      </Text>
                                      <View style={styles.linkMetaRow}>
                                        <View
                                          style={[
                                            styles.linkStatusBadge,
                                            link.processed ? styles.linkStatusProcessed : styles.linkStatusPending,
                                          ]}
                                        >
                                          <Text style={styles.linkStatusText}>
                                            {link.processed ? 'In cos' : 'De verificat'}
                                          </Text>
                                        </View>
                                        <Text style={styles.linkMetaText}>
                                          {link.processed
                                            ? `Procesat${link.processed_by ? ` de ${link.processed_by}` : ''}`
                                            : 'Asteapta procesare'}
                                        </Text>
                                      </View>
                                    </View>
                                    {isOwnOrder &&
                                      link.user_name !== currentUser.display_name &&
                                      !link.processed && (
                                        <Pressable
                                          onPress={() => openAndProcessLink(order.id, link)}
                                          style={styles.linkPlusButton}
                                        >
                                          <Text style={styles.linkPlusText}>+</Text>
                                        </Pressable>
                                      )}
                                  </View>
                                ))
                              )}

                              {slotsLeftForLinks > 0 ? (
                                <>
                                  <TextInput
                                    value={orderLinkDraftByOrderId[order.id] ?? ''}
                                    onChangeText={(value) =>
                                      setOrderLinkDraftByOrderId((previous) => ({
                                        ...previous,
                                        [order.id]: value,
                                      }))
                                    }
                                    placeholder="https://... link produs"
                                    placeholderTextColor="#94a3b8"
                                    style={styles.input}
                                    autoCapitalize="none"
                                  />
                                  <Pressable
                                    onPress={() => addProductLink(order.id)}
                                    style={styles.secondaryButton}
                                  >
                                    <Text style={styles.secondaryButtonText}>Adauga slot/link produs</Text>
                                  </Pressable>
                                </>
                              ) : (
                                <Text style={styles.emptyState}>
                                  Ai folosit toate cele 10 sloturi de linkuri.
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#cbd5e1',
    marginTop: 4,
    fontSize: 14,
  },
  infoRow: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  online: {
    color: '#86efac',
  },
  offline: {
    color: '#fca5a5',
  },
  userRow: {
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerNotifBadge: {
    color: '#d9f99d',
    fontSize: 11,
    fontWeight: '700',
  },
  userText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#fda4af',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  logoutButtonText: {
    color: '#ffe4e6',
    fontSize: 12,
    fontWeight: '700',
  },
  topNav: {
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#84cc16',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
  },
  backButtonText: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '700',
  },
  locationNotice: {
    marginTop: 8,
    marginHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationWarning: {
    marginTop: 8,
    marginHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#7c2d12',
    padding: 10,
  },
  noticeText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  warningText: {
    color: '#ffedd5',
    fontSize: 12,
  },
  content: {
    padding: 14,
    paddingBottom: 36,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  authCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  authProviderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  authProviderButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  authProviderButtonActive: {
    backgroundColor: '#84cc16',
  },
  authProviderText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 13,
  },
  authProviderTextActive: {
    color: '#132b02',
  },
  authModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  authModeButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  authModeButtonActive: {
    backgroundColor: '#84cc16',
  },
  authModeText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 13,
  },
  authModeTextActive: {
    color: '#132b02',
  },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    backgroundColor: '#0b1220',
    fontSize: 14,
  },
  addressBox: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0b1220',
    gap: 4,
  },
  addressTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  addressText: {
    color: '#f1f5f9',
    fontSize: 12,
  },
  googleButton: {
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 14,
  },
  smallNote: {
    color: '#94a3b8',
    fontSize: 11,
  },
  homeCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  notificationsCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#0b1220',
    gap: 8,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationsTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  notificationsBadge: {
    color: '#d9f99d',
    fontSize: 11,
    fontWeight: '700',
  },
  notificationRow: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#111827',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationTextWrap: {
    flex: 1,
    gap: 2,
  },
  notificationTitleText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  notificationMessageText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  notificationTimeText: {
    color: '#64748b',
    fontSize: 10,
  },
  notificationReadButton: {
    borderWidth: 1,
    borderColor: '#84cc16',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  notificationReadButtonText: {
    color: '#d9f99d',
    fontSize: 11,
    fontWeight: '700',
  },
  homeTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
  },
  homeSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 8,
  },
  homeActionPrimary: {
    backgroundColor: '#84cc16',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  homeActionPrimaryText: {
    color: '#132b02',
    fontSize: 16,
    fontWeight: '800',
  },
  homeActionSecondary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#84cc16',
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#0b1220',
  },
  homeActionSecondaryText: {
    color: '#d9f99d',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#64748b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0b1220',
  },
  chipSelected: {
    borderColor: '#84cc16',
    backgroundColor: '#365314',
  },
  chipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#ecfccb',
  },
  radiusBarWrapper: {
    marginBottom: 10,
    gap: 8,
  },
  radiusTrackArea: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    backgroundColor: '#0b1220',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  radiusTrackRail: {
    marginHorizontal: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#233245',
    overflow: 'hidden',
  },
  radiusTrackBase: {
    ...StyleSheet.absoluteFillObject,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#233245',
  },
  radiusTrackFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#84cc16',
  },
  radiusStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -7,
  },
  radiusStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  radiusDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    marginTop: 3,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
  },
  radiusDotReached: {
    backgroundColor: '#a3e635',
    borderColor: '#a3e635',
  },
  radiusDotSelected: {
    width: 14,
    height: 14,
    backgroundColor: '#d9f99d',
    borderColor: '#ecfccb',
  },
  radiusLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  radiusLabelSelected: {
    color: '#ecfccb',
  },
  radiusValueText: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#84cc16',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#132b02',
    fontWeight: '800',
    fontSize: 15,
  },
  myOrdersHeader: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineAction: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '700',
  },
  refreshButton: {
    borderRadius: 10,
    borderColor: '#84cc16',
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  refreshButtonText: {
    color: '#d9f99d',
    fontWeight: '700',
    fontSize: 13,
  },
  ordersSection: {
    marginTop: 10,
    gap: 10,
  },
  emptyState: {
    color: '#94a3b8',
    fontSize: 13,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#0b1220',
    gap: 4,
  },
  orderTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  orderMeta: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  linksCard: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    gap: 8,
  },
  linksToggleButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: '#111827',
  },
  linksToggleText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
  },
  linksBody: {
    gap: 8,
  },
  linkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkItemContent: {
    flex: 1,
    gap: 2,
  },
  linkMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  linkStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  linkStatusProcessed: {
    backgroundColor: '#14532d',
  },
  linkStatusPending: {
    backgroundColor: '#78350f',
  },
  linkStatusText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '800',
  },
  linkItemText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  linkMetaText: {
    color: '#93c5fd',
    fontSize: 11,
  },
  linkPlusButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#84cc16',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14532d',
  },
  linkPlusText: {
    color: '#d9f99d',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  statusTag: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontWeight: '700',
    fontSize: 11,
  },
  statusOk: {
    backgroundColor: '#14532d',
    color: '#bbf7d0',
  },
  statusWait: {
    backgroundColor: '#78350f',
    color: '#fde68a',
  },
  secondaryButton: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#84cc16',
    paddingVertical: 9,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#d9f99d',
    fontWeight: '700',
    fontSize: 13,
  },
  disabledButton: {
    borderColor: '#475569',
    backgroundColor: '#1e293b',
  },
});
