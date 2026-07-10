import * as Google from 'expo-auth-session/providers/google';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
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
  StatusBar as NativeStatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { fetchJson } from './src/api';
import { clearStoredAuthSession, getStoredAuthSession, saveAuthSession } from './src/authStorage';
import {
  cacheOrderLinks,
  cacheOrderMessages,
  getCachedOrderLinks,
  getCachedOrderMessages,
} from './src/orderCache';
import {
  ALL_PLATFORMS,
  API_BASE_URL,
  DEFAULT_PLATFORMS,
  JOIN_RESERVATION_MINUTES,
  MAX_PRODUCT_LINK_SLOTS,
  MIN_PEOPLE_OPTIONS,
  WAIT_DAYS_OPTIONS,
} from './src/constants';
import type {
  ApiStatus,
  AuthMode,
  AuthProvider,
  AuthResponse,
  Coordinate,
  NotificationItem,
  NotificationsResponse,
  OrderMessageItem,
  OrderMessagesResponse,
  OrderItem,
  OrderStatus,
  ProductLinkItem,
  ProductLinksResponse,
  Tab,
  User,
} from './src/types';
import { AuthSection } from './src/components/AuthSection';
import { HomeSection } from './src/components/HomeSection';
import { MyOrderCard, NearbyOrderCard } from './src/components/OrderCard';
import { ChipButton } from './src/components/ChipButton';
import { RadiusBarSelector } from './src/components/RadiusBarSelector';

WebBrowser.maybeCompleteAuthSession();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

function pushPlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return 'unknown';
}

async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('cartbuddy-default', {
      name: 'CartBuddy',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;
  if (finalStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }
  const result = await Notifications.getExpoPushTokenAsync();
  return result.data;
}

export default function App() {
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 600;
  const tabletWidthStyle = isTabletLayout ? styles.tabletWidth : null;

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [locationState, setLocationState] = useState<'loading' | 'granted' | 'fallback'>('loading');
  const [myLocation, setMyLocation] = useState<Coordinate | null>(null);
  const [detectedAddress, setDetectedAddress] = useState('');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [platforms, setPlatforms] = useState<string[]>([...DEFAULT_PLATFORMS]);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isRestoringAuth, setIsRestoringAuth] = useState(true);
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
  const [expandedChatOrderIds, setExpandedChatOrderIds] = useState<Set<string>>(new Set());
  const [orderMessagesByOrderId, setOrderMessagesByOrderId] = useState<Record<string, OrderMessageItem[]>>({});
  const [orderMessageDraftByOrderId, setOrderMessageDraftByOrderId] = useState<Record<string, string>>({});
  const [loadingMessagesByOrderId, setLoadingMessagesByOrderId] = useState<Record<string, boolean>>({});
  const [reservedOrderExpiresById, setReservedOrderExpiresById] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [registeredPushToken, setRegisteredPushToken] = useState<string | null>(null);

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
    redirectUri: 'app.cartbuddy:/oauthredirect',
    scopes: ['openid', 'profile', 'email'],
  });

  const resetAuthState = useCallback(() => {
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
    setExpandedChatOrderIds(new Set());
    setOrderMessagesByOrderId({});
    setOrderMessageDraftByOrderId({});
    setLoadingMessagesByOrderId({});
    setReservedOrderExpiresById({});
    setNotifications([]);
    setUnreadNotificationsCount(0);
    setRegisteredPushToken(null);
    setActiveTab('home');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreAuthSession() {
      try {
        const session = await getStoredAuthSession();
        if (cancelled || !session) {
          return;
        }

        setAuthToken(session.token);
        setCurrentUser(session.user);
      } catch {
        await clearStoredAuthSession();
      } finally {
        if (!cancelled) {
          setIsRestoringAuth(false);
        }
      }
    }

    void restoreAuthSession();
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    if (apiStatus !== 'online' || !authToken) {
      return;
    }
    const token = authToken;

    async function validateStoredSession() {
      try {
        const user = await fetchJson<User>(`${API_BASE_URL}/auth/me`, {
          headers: { ...authHeaders() },
        });
        if (!cancelled) {
          setCurrentUser(user);
          await saveAuthSession(token, user);
        }
      } catch {
        if (!cancelled) {
          resetAuthState();
          await clearStoredAuthSession();
        }
      }
    }

    void validateStoredSession();
    return () => {
      cancelled = true;
    };
  }, [apiStatus, authHeaders, authToken, resetAuthState]);

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

  useEffect(() => {
    let cancelled = false;
    if (apiStatus !== 'online' || !authToken || registeredPushToken === authToken) {
      return;
    }

    async function registerDevicePushToken() {
      try {
        const token = await getExpoPushToken();
        if (cancelled || !token) {
          return;
        }
        await fetchJson<{ status: string }>(`${API_BASE_URL}/push-tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ token, platform: pushPlatform() }),
        });
        if (!cancelled) {
          setRegisteredPushToken(authToken);
        }
      } catch {
        // Push is best-effort; in-app notifications still work without device registration.
      }
    }

    void registerDevicePushToken();
    return () => {
      cancelled = true;
    };
  }, [apiStatus, authHeaders, authToken, registeredPushToken]);

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

      await saveAuthSession(result.token, result.user);
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
      setIsAuthSubmitting(true);
      try {
        const result = await fetchJson<AuthResponse>(`${API_BASE_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            address: detectedAddress || `Lat ${myLocation.latitude}, Lon ${myLocation.longitude}`,
            latitude: myLocation.latitude,
            longitude: myLocation.longitude,
          }),
        });
        await saveAuthSession(result.token, result.user);
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
    [apiStatus, detectedAddress, myLocation],
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

  async function logout() {
    resetAuthState();
    await clearStoredAuthSession();
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
      setExpandedChatOrderIds((previous) => new Set([...previous, orderId]));
      await Promise.all([
        loadOrderLinks(orderId),
        loadOrderMessages(orderId),
        loadNearbyOrders(),
        loadMyOrders(),
        loadNotifications(),
      ]);
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
      const cachedLinks = await getCachedOrderLinks(orderId);
      if (cachedLinks) {
        setOrderLinksByOrderId((previous) => ({ ...previous, [orderId]: cachedLinks }));
      }
      const result = await fetchJson<ProductLinksResponse>(`${API_BASE_URL}/orders/${orderId}/links`, {
        headers: { ...authHeaders() },
      });
      setOrderLinksByOrderId((previous) => ({ ...previous, [orderId]: result.items }));
      setSlotsUsedByOrderId((previous) => ({ ...previous, [orderId]: result.slots_used }));
      await cacheOrderLinks(orderId, result.items);
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
      await cacheOrderLinks(orderId, result.items);
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

  async function loadOrderMessages(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      return;
    }
    setLoadingMessagesByOrderId((previous) => ({ ...previous, [orderId]: true }));
    try {
      const cachedMessages = await getCachedOrderMessages(orderId);
      if (cachedMessages) {
        setOrderMessagesByOrderId((previous) => ({ ...previous, [orderId]: cachedMessages }));
      }
      const result = await fetchJson<OrderMessagesResponse>(`${API_BASE_URL}/orders/${orderId}/messages`, {
        headers: { ...authHeaders() },
      });
      setOrderMessagesByOrderId((previous) => ({ ...previous, [orderId]: result.items }));
      await cacheOrderMessages(orderId, result.items);
    } catch {
      Alert.alert('Chat', 'Nu am putut incarca mesajele pentru aceasta comanda.');
    } finally {
      setLoadingMessagesByOrderId((previous) => ({ ...previous, [orderId]: false }));
    }
  }

  async function sendOrderMessage(orderId: string) {
    const draft = orderMessageDraftByOrderId[orderId]?.trim() ?? '';
    if (!draft) {
      Alert.alert('Mesaj lipsa', 'Scrie un mesaj pentru chat.');
      return;
    }

    try {
      const result = await fetchJson<OrderMessagesResponse>(`${API_BASE_URL}/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message: draft }),
      });
      setOrderMessagesByOrderId((previous) => ({ ...previous, [orderId]: result.items }));
      setOrderMessageDraftByOrderId((previous) => ({ ...previous, [orderId]: '' }));
      await cacheOrderMessages(orderId, result.items);
      void loadNotifications();
    } catch {
      Alert.alert('Chat', 'Nu am putut trimite mesajul.');
    }
  }

  function toggleOrderChat(orderId: string) {
    const isOpen = expandedChatOrderIds.has(orderId);
    if (isOpen) {
      setExpandedChatOrderIds((previous) => {
        const updated = new Set(previous);
        updated.delete(orderId);
        return updated;
      });
      return;
    }
    setExpandedChatOrderIds((previous) => {
      const updated = new Set(previous);
      updated.add(orderId);
      return updated;
    });
    if (!orderMessagesByOrderId[orderId]) {
      void loadOrderMessages(orderId);
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
      await cacheOrderLinks(orderId, result.items);
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

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', 'Trebuie sa fii logat si backend-ul sa fie pornit.');
      return;
    }

    try {
      await fetchJson<OrderItem>(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      await Promise.all([loadNearbyOrders(), loadMyOrders(), loadNotifications()]);
    } catch {
      Alert.alert('Status', 'Nu am putut actualiza statusul comenzii.');
    }
  }

  return (
    <SafeAreaView style={[styles.screen, styles.androidStatusBarInset]}>
      <ExpoStatusBar style="light" />
      <View style={[styles.header, tabletWidthStyle]}>
        <Text style={styles.title}>CartBuddy</Text>
        <Text style={styles.subtitle}>Comenzi comune locale pentru cost mai mic la livrare.</Text>
      </View>

      {currentUser && (
        <View style={[styles.userRow, tabletWidthStyle]}>
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
        <View style={[styles.topNav, tabletWidthStyle]}>
          <Pressable onPress={() => setActiveTab('home')} style={styles.backButton}>
            <Text style={styles.backButtonText}>Inapoi la Home</Text>
          </Pressable>
        </View>
      )}

      {locationState === 'loading' && (
        <View style={[styles.locationNotice, tabletWidthStyle]}>
          <ActivityIndicator color="#84cc16" />
          <Text style={styles.noticeText}>Determin locatia...</Text>
        </View>
      )}

      {locationState === 'fallback' && (
        <View style={[styles.locationWarning, tabletWidthStyle]}>
          <Text style={styles.warningText}>
            Folosesc locatie demo (Bucuresti) deoarece permisiunea GPS lipseste.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.content, isTabletLayout && styles.tabletContent]}>
        {isRestoringAuth ? (
          <View style={styles.authCard}>
            <ActivityIndicator color="#84cc16" />
            <Text style={styles.emptyState}>Refac sesiunea...</Text>
          </View>
        ) : !currentUser ? (
          <AuthSection
            authProvider={authProvider}
            onAuthProviderChange={setAuthProvider}
            authMode={authMode}
            onAuthModeChange={setAuthMode}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            phone={phone}
            onPhoneChange={setPhone}
            email={email}
            onEmailChange={setEmail}
            password={password}
            onPasswordChange={setPassword}
            detectedAddress={detectedAddress}
            isResolvingAddress={isResolvingAddress}
            isAuthSubmitting={isAuthSubmitting}
            onSubmitEmailAuth={submitEmailAuth}
            onStartGoogleLogin={startGoogleLogin}
            googleReady={Boolean(googleRequest)}
            googleEnabled={googleEnabled}
            requiredGoogleEnvVar={requiredGoogleEnvVar}
          />
        ) : activeTab === 'home' ? (
          <HomeSection
            unreadNotificationsCount={unreadNotificationsCount}
            notifications={notifications}
            isLoadingNotifications={isLoadingNotifications}
            onOpenNearby={() => setActiveTab('nearby')}
            onOpenCreate={() => setActiveTab('create')}
            onRefreshNotifications={loadNotifications}
            onMarkNotificationRead={markNotificationRead}
          />
        ) : activeTab === 'create' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1) Alege platforma</Text>
            <View style={styles.chipWrap}>
              {platforms.map((platform) => (
                <ChipButton
                  key={platform}
                  label={platform}
                  selected={selectedPlatform === platform}
                  onPress={() => setSelectedPlatform(platform)}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>2) Perioada maxima de asteptare (1-10 zile)</Text>
            <View style={styles.chipWrap}>
              {WAIT_DAYS_OPTIONS.map((days) => (
                <ChipButton
                  key={days}
                  label={String(days)}
                  selected={selectedWaitDays === days}
                  onPress={() => setSelectedWaitDays(days)}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>3) Numar minim buddy (2-10)</Text>
            <View style={styles.chipWrap}>
              {MIN_PEOPLE_OPTIONS.map((people) => (
                <ChipButton
                  key={people}
                  label={String(people)}
                  selected={selectedMinPeople === people}
                  onPress={() => setSelectedMinPeople(people)}
                />
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
                {myOrders.map((order) => (
                  <MyOrderCard
                    key={order.id}
                    order={order}
                    onExtend={extendOrder}
                    onStatusChange={updateOrderStatus}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Filtre</Text>
            <View style={styles.chipWrap}>
              <ChipButton
                key={ALL_PLATFORMS}
                label={ALL_PLATFORMS}
                selected={nearbyPlatformFilter === ALL_PLATFORMS}
                onPress={() => setNearbyPlatformFilter(ALL_PLATFORMS)}
              />
              {platforms.map((platform) => (
                <ChipButton
                  key={platform}
                  label={platform}
                  selected={nearbyPlatformFilter === platform}
                  onPress={() => setNearbyPlatformFilter(platform)}
                />
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
                orders.map((order) => (
                  <NearbyOrderCard
                    key={order.id}
                    order={order}
                    currentUserName={currentUser.display_name}
                    isJoined={joinedOrderIds.has(order.id) || order.join_state === 'joined'}
                    reservationExpiresAt={reservedOrderExpiresById[order.id] ?? order.my_reservation_expires_at}
                    isLinksOpen={expandedLinksOrderIds.has(order.id)}
                    links={orderLinksByOrderId[order.id] ?? []}
                    linkDraft={orderLinkDraftByOrderId[order.id] ?? ''}
                    isLoadingLinks={Boolean(loadingLinksByOrderId[order.id])}
                    slotsUsed={slotsUsedByOrderId[order.id] ?? 0}
                    isChatOpen={expandedChatOrderIds.has(order.id)}
                    messages={orderMessagesByOrderId[order.id] ?? []}
                    messageDraft={orderMessageDraftByOrderId[order.id] ?? ''}
                    isLoadingMessages={Boolean(loadingMessagesByOrderId[order.id])}
                    onJoin={joinOrder}
                    onToggleLinks={toggleOrderLinks}
                    onLinkDraftChange={(orderId, value) =>
                      setOrderLinkDraftByOrderId((previous) => ({
                        ...previous,
                        [orderId]: value,
                      }))
                    }
                    onAddProductLink={addProductLink}
                    onProcessLink={openAndProcessLink}
                    onToggleChat={toggleOrderChat}
                    onRefreshMessages={loadOrderMessages}
                    onMessageDraftChange={(orderId, value) =>
                      setOrderMessageDraftByOrderId((previous) => ({
                        ...previous,
                        [orderId]: value,
                      }))
                    }
                    onSendMessage={sendOrderMessage}
                  />
                ))
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
  androidStatusBarInset: {
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
  },
  tabletWidth: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
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
  tabletContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 18,
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
  smallNote: {
    color: '#94a3b8',
    fontSize: 11,
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
});
