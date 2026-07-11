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
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { fetchJson } from './src/api';
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  getStoredLanguagePreference,
  saveAuthSession,
  saveLanguagePreference,
} from './src/authStorage';
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
  MAX_PRODUCT_LINK_SLOTS,
  MIN_PEOPLE_OPTIONS,
  OTHER_PLATFORMS,
  WAIT_DAYS_OPTIONS,
} from './src/constants';
import type {
  ApiStatus,
  AuthMode,
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
  UserRatingSummary,
} from './src/types';
import { AuthSection } from './src/components/AuthSection';
import { HomeSection } from './src/components/HomeSection';
import { MyOrderCard, NearbyOrderCard } from './src/components/OrderCard';
import { OrdersMap } from './src/components/OrdersMap';
import { ChipButton } from './src/components/ChipButton';
import { RadiusBarSelector } from './src/components/RadiusBarSelector';
import { OrderLocationPicker } from './src/components/OrderLocationPicker';
import { HelpModal } from './src/components/HelpModal';
import { LANGUAGES, translate, type Language, type TranslationKey } from './src/i18n';

WebBrowser.maybeCompleteAuthSession();

const CURRENCIES = [
  { code: 'EUR', symbol: '€', ro: 'Euro', en: 'Euro' },
  { code: 'USD', symbol: '$', ro: 'Dolar american', en: 'US dollar' },
  { code: 'RON', symbol: 'lei', ro: 'Leu românesc', en: 'Romanian leu' },
  { code: 'GBP', symbol: '£', ro: 'Liră sterlină', en: 'British pound' },
  { code: 'MDL', symbol: 'L', ro: 'Leu moldovenesc', en: 'Moldovan leu' },
  { code: 'CHF', symbol: 'CHF', ro: 'Franc elvețian', en: 'Swiss franc' },
  { code: 'CAD', symbol: 'C$', ro: 'Dolar canadian', en: 'Canadian dollar' },
  { code: 'AUD', symbol: 'A$', ro: 'Dolar australian', en: 'Australian dollar' },
  { code: 'JPY', symbol: '¥', ro: 'Yen japonez', en: 'Japanese yen' },
  { code: 'CNY', symbol: '¥', ro: 'Yuan chinezesc', en: 'Chinese yuan' },
  { code: 'PLN', symbol: 'zł', ro: 'Zlot polonez', en: 'Polish zloty' },
  { code: 'HUF', symbol: 'Ft', ro: 'Forint maghiar', en: 'Hungarian forint' },
  { code: 'TRY', symbol: '₺', ro: 'Liră turcească', en: 'Turkish lira' },
] as const;

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
  const [language, setLanguage] = useState<Language>('ro');
  const [locationState, setLocationState] = useState<'loading' | 'granted' | 'fallback'>('loading');
  const [myLocation, setMyLocation] = useState<Coordinate | null>(null);
  const [detectedAddress, setDetectedAddress] = useState('');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [platforms, setPlatforms] = useState<string[]>([...DEFAULT_PLATFORMS]);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isRestoringAuth, setIsRestoringAuth] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isMyRatingsOpen, setIsMyRatingsOpen] = useState(false);
  const [isLoadingMyRatings, setIsLoadingMyRatings] = useState(false);
  const [myRatingSummary, setMyRatingSummary] = useState<UserRatingSummary | null>(null);

  const [selectedPlatform, setSelectedPlatform] = useState<string>('Amazon');
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [selectedRadius, setSelectedRadius] = useState<number>(500);
  const [selectedMinPeople, setSelectedMinPeople] = useState<number>(2);
  const [selectedWaitDays, setSelectedWaitDays] = useState<number>(1);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [processingFee, setProcessingFee] = useState('');
  const [minimumOrderValue, setMinimumOrderValue] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('RON');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [orderLocationMode, setOrderLocationMode] = useState<'current' | 'custom'>('current');
  const [customOrderLocation, setCustomOrderLocation] = useState<Coordinate | null>(null);
  const [isOrderLocationPickerOpen, setIsOrderLocationPickerOpen] = useState(false);

  const [nearbyRadiusFilter, setNearbyRadiusFilter] = useState<number>(1000);
  const [nearbyPlatformFilter, setNearbyPlatformFilter] = useState<string>(ALL_PLATFORMS);
  const [isNearbyMapOpen, setIsNearbyMapOpen] = useState(false);

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
    redirectUri: Platform.OS === 'android' ? 'app.cartbuddy:/oauthredirect' : undefined,
    scopes: ['openid', 'profile', 'email'],
  });

  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);

  const changeLanguage = useCallback((nextLanguage: Language) => {
    setLanguage(nextLanguage);
    void saveLanguagePreference(nextLanguage);
  }, []);

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
    if (!currentUser) {
      setProfilePhone('');
      setProfileAddress('');
      return;
    }
    setProfilePhone(currentUser.phone);
    setProfileAddress(currentUser.address);
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;

    async function restoreAuthSession() {
      try {
        const storedLanguage = await getStoredLanguagePreference();
        if (!cancelled && storedLanguage) {
          setLanguage(storedLanguage);
        }
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
        if (selectedPlatform !== OTHER_PLATFORMS && !result.items.includes(selectedPlatform)) {
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
      if (nearbyPlatformFilter !== ALL_PLATFORMS && nearbyPlatformFilter !== OTHER_PLATFORMS) {
        params.set('platform', nearbyPlatformFilter);
      }

      let result: { items: OrderItem[] };
      try {
        result = await fetchJson<{ items: OrderItem[] }>(
          `${API_BASE_URL}/orders/nearby?${params.toString()}`,
          { headers: { ...authHeaders() } },
        );
      } catch (error) {
        if (nearbyRadiusFilter < 5000) {
          throw error;
        }
        params.set('radius_meters', '3000');
        result = await fetchJson<{ items: OrderItem[] }>(
          `${API_BASE_URL}/orders/nearby?${params.toString()}`,
          { headers: { ...authHeaders() } },
        );
      }
      const visibleItems =
        nearbyPlatformFilter === OTHER_PLATFORMS
          ? result.items.filter((item) => !platforms.includes(item.platform))
          : result.items;
      setOrders(visibleItems);
      setJoinedOrderIds(new Set(visibleItems.filter((item) => item.join_state === 'joined').map((item) => item.id)));
      const reservedMap: Record<string, string> = {};
      for (const item of visibleItems) {
        if (item.join_state === 'reserved' && item.my_reservation_expires_at) {
          reservedMap[item.id] = item.my_reservation_expires_at;
        }
      }
      setReservedOrderExpiresById(reservedMap);
    } catch {
      Alert.alert(t('error'), t('loadNearbyFailed'));
    } finally {
      setIsLoadingOrders(false);
    }
  }, [apiStatus, authHeaders, authToken, myLocation, nearbyPlatformFilter, nearbyRadiusFilter, platforms, t]);

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
      Alert.alert(t('error'), t('loadMineFailed'));
    } finally {
      setIsLoadingMyOrders(false);
    }
  }, [apiStatus, authHeaders, authToken, t]);

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
      Alert.alert(t('backendOffline'), t('backendBeforeAuth'));
      return;
    }
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('incompleteData'), t('emailPasswordRequired'));
      return;
    }
    if (authMode === 'register' && displayName.trim().length < 2) {
      Alert.alert(t('incompleteData'), t('nameTooShort'));
      return;
    }
    if (authMode === 'register' && phone.trim().length < 7) {
      Alert.alert(t('incompleteData'), t('phoneRequired'));
      return;
    }
    if (authMode === 'register' && !myLocation) {
      Alert.alert(t('locationUnavailable'), t('geolocationRequired'));
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
      Alert.alert(t('authFailed'), error instanceof Error ? error.message : t('unknownError'));
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  const submitGoogleAuth = useCallback(
    async (accessToken: string) => {
      if (apiStatus !== 'online') {
        Alert.alert(t('backendOffline'), t('backendBeforeAuth'));
        return;
      }
      if (!myLocation) {
        Alert.alert(t('locationUnavailable'), t('geolocationRequired'));
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
        Alert.alert(t('googleLoginFailed'), error instanceof Error ? error.message : t('unknownError'));
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [apiStatus, detectedAddress, myLocation, t],
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
      Alert.alert('Google', t('googleTokenMissing'));
      return;
    }
    void submitGoogleAuth(accessToken);
  }, [googleResponse, submitGoogleAuth]);

  async function startGoogleLogin() {
    if (!googleEnabled) {
      return;
    }
    if (!googleRequest) {
      Alert.alert('Google', t('googleInitializing'));
      return;
    }
    await promptGoogleAuth();
  }

  async function logout() {
    resetAuthState();
    await clearStoredAuthSession();
  }

  async function saveProfile() {
    if (apiStatus !== 'online' || !authToken || !currentUser) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }
    if (profilePhone.trim() && profilePhone.trim().length < 7) {
      Alert.alert(t('profile'), t('phoneTooShort'));
      return;
    }
    if (profileAddress.trim().length < 5) {
      Alert.alert(t('profile'), t('addressTooShort'));
      return;
    }

    setIsProfileSaving(true);
    try {
      const updatedUser = await fetchJson<User>(`${API_BASE_URL}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          phone: profilePhone.trim(),
          address: profileAddress.trim(),
          latitude: myLocation?.latitude ?? currentUser.latitude,
          longitude: myLocation?.longitude ?? currentUser.longitude,
        }),
      });
      setCurrentUser(updatedUser);
      await saveAuthSession(authToken, updatedUser);
      Alert.alert(t('profile'), t('profileSaved'));
    } catch (error) {
      Alert.alert(t('profile'), error instanceof Error ? error.message : t('profileSaveFailed'));
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function toggleMyRatings() {
    if (isMyRatingsOpen) {
      setIsMyRatingsOpen(false);
      return;
    }
    setIsMyRatingsOpen(true);
    if (myRatingSummary || !authToken) return;
    setIsLoadingMyRatings(true);
    try {
      const summary = await fetchJson<UserRatingSummary>(`${API_BASE_URL}/auth/me/ratings`, {
        headers: authHeaders(),
      });
      setMyRatingSummary(summary);
    } catch {
      setMyRatingSummary({
        organizer_average: null,
        organizer_count: 0,
        participant_average: null,
        participant_count: 0,
        recent_comments: [],
      });
    } finally {
      setIsLoadingMyRatings(false);
    }
  }

  async function createOrder() {
    const orderLocation = orderLocationMode === 'custom' ? customOrderLocation : myLocation;
    if (!orderLocation) {
      Alert.alert(t('locationUnavailable'), t('noValidLocation'));
      return;
    }
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }
    const platformForOrder =
      selectedPlatform === OTHER_PLATFORMS ? customPlatformName.trim() : selectedPlatform;
    if (!platformForOrder) {
      Alert.alert(t('incompleteData'), t('customPlatformRequired'));
      return;
    }
    const parseAmount = (value: string) => Number(value.trim().replace(',', '.'));
    const parsedDeliveryFee = parseAmount(deliveryFee);
    const parsedProcessingFee = parseAmount(processingFee);
    const parsedMinimumValue = minimumOrderValue.trim() ? parseAmount(minimumOrderValue) : null;
    if (
      !deliveryFee.trim() || !processingFee.trim() ||
      !Number.isFinite(parsedDeliveryFee) || parsedDeliveryFee < 0 ||
      !Number.isFinite(parsedProcessingFee) || parsedProcessingFee < 0 ||
      (parsedMinimumValue !== null && (!Number.isFinite(parsedMinimumValue) || parsedMinimumValue < 0))
    ) {
      Alert.alert(t('invalidAmounts'), t('invalidAmountsMessage'));
      return;
    }

    try {
      await fetchJson<OrderItem>(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          platform: platformForOrder,
          min_people: selectedMinPeople,
          max_wait_days: selectedWaitDays,
          latitude: orderLocation.latitude,
          longitude: orderLocation.longitude,
          delivery_fee: parsedDeliveryFee,
          processing_fee: parsedProcessingFee,
          minimum_order_value: parsedMinimumValue,
          currency: selectedCurrency,
        }),
      });
      setDeliveryFee('');
      setProcessingFee('');
      setMinimumOrderValue('');
      setActiveTab('nearby');
      setNearbyPlatformFilter(selectedPlatform === OTHER_PLATFORMS ? OTHER_PLATFORMS : platformForOrder);
      setNearbyRadiusFilter(selectedRadius);
      await Promise.all([loadNearbyOrders(), loadMyOrders(), loadNotifications()]);
      Alert.alert(t('orderCreated'), t('orderPublished'));
    } catch {
      Alert.alert(t('error'), t('createOrderFailed'));
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
      Alert.alert(t('notifications'), t('notificationsReadFailed'));
    }
  }

  async function joinOrder(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
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
        Alert.alert(t('spotReserved'), t('spotReservedMessage'));
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
        Alert.alert(t('orderFull'), t('orderFullMessage'));
        await loadNearbyOrders();
        return;
      }
      Alert.alert(t('error'), t('joinOrderFailed'));
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
      Alert.alert(t('links'), t('loadLinksFailed'));
    } finally {
      setLoadingLinksByOrderId((previous) => ({ ...previous, [orderId]: false }));
    }
  }

  async function addProductLink(orderId: string) {
    const draft = orderLinkDraftByOrderId[orderId]?.trim() ?? '';
    if (!draft) {
      Alert.alert(t('missingLink'), t('enterProductLink'));
      return;
    }
    const currentSlotsUsed = slotsUsedByOrderId[orderId] ?? 0;
    if (currentSlotsUsed >= MAX_PRODUCT_LINK_SLOTS) {
      Alert.alert(t('limitReached'), t('maxLinksReached'));
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
        Alert.alert(t('limitReached'), t('allSlotsReached'));
        return;
      }
      if (message.includes('Invalid product URL')) {
        Alert.alert(t('invalidUrl'), t('validHttpUrlRequired'));
        return;
      }
      Alert.alert(t('error'), t('saveLinkFailed'));
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
      Alert.alert(t('chat'), t('loadChatFailed'));
    } finally {
      setLoadingMessagesByOrderId((previous) => ({ ...previous, [orderId]: false }));
    }
  }

  async function sendOrderMessage(orderId: string) {
    const draft = orderMessageDraftByOrderId[orderId]?.trim() ?? '';
    if (!draft) {
      Alert.alert(t('missingMessage'), t('writeChatMessage'));
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
      Alert.alert(t('chat'), t('sendChatFailed'));
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

  async function requestExtraSpot(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }
    try {
      await fetchJson(`${API_BASE_URL}/orders/${orderId}/capacity-requests`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      await Promise.all([loadNearbyOrders(), loadNotifications()]);
      Alert.alert(t('extraSpotRequested'), t('extraSpotRequestedMessage'));
    } catch {
      Alert.alert(t('error'), t('extraSpotRequestFailed'));
    }
  }

  function confirmDeleteNotifications() {
    Alert.alert(t('deleteNotifications'), t('deleteNotificationsConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteAll'),
        style: 'destructive',
        onPress: () => void deleteAllNotifications(),
      },
    ]);
  }

  async function deleteAllNotifications() {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }
    try {
      await fetchJson<NotificationsResponse>(`${API_BASE_URL}/notifications`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      setNotifications([]);
      setUnreadNotificationsCount(0);
    } catch {
      Alert.alert(t('error'), t('deleteNotificationsFailed'));
    }
  }

  async function openNearbyOrdersInGoogleMaps() {
    if (!myLocation) {
      Alert.alert(t('locationUnavailable'), t('noValidLocation'));
      return;
    }

    const center = `${myLocation.latitude},${myLocation.longitude}`;
    const url = `https://www.google.com/maps/@?api=1&map_action=map&center=${encodeURIComponent(center)}&zoom=14`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('invalidLink'), t('openLinkFailed'));
    }
  }

  async function openAndProcessLink(orderId: string, link: ProductLinkItem) {
    try {
      await Linking.openURL(link.url);
    } catch {
      Alert.alert(t('invalidLink'), t('openLinkFailed'));
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
      Alert.alert(t('processingTitle'), t('processLinkFailed'));
    }
  }

  async function extendOrder(orderId: string) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }

    try {
      await fetchJson<OrderItem>(`${API_BASE_URL}/orders/${orderId}/extend`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      await Promise.all([loadNearbyOrders(), loadMyOrders(), loadNotifications()]);
      Alert.alert(t('orderExtended'), t('orderExtendedMessage'));
    } catch {
      Alert.alert(t('cannotExtend'), t('cannotExtendMessage'));
    }
  }

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
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
      Alert.alert(t('status'), t('statusUpdateFailed'));
    }
  }

  async function updateOrderCosts(orderId: string, delivery: number, processing: number, minimum: number | null) {
    if (![delivery, processing, minimum ?? 0].every((value) => Number.isFinite(value) && value >= 0)) {
      Alert.alert(t('error'), t('invalidCosts'));
      return;
    }
    try {
      const updated = await fetchJson<OrderItem>(`${API_BASE_URL}/orders/${orderId}/costs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ delivery_fee: delivery, processing_fee: processing, minimum_order_value: minimum }),
      });
      setMyOrders((items) => items.map((item) => item.id === orderId ? updated : item));
      setOrders((items) => items.map((item) => item.id === orderId ? updated : item));
    } catch {
      Alert.alert(t('error'), t('costsUpdateFailed'));
    }
  }

  async function updateOrderLocation(orderId: string, latitude: number, longitude: number) {
    try {
      const updated = await fetchJson<OrderItem>(`${API_BASE_URL}/orders/${orderId}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ latitude, longitude }),
      });
      setMyOrders((items) => items.map((item) => item.id === orderId ? updated : item));
      setOrders((items) => items.map((item) => item.id === orderId ? updated : item));
    } catch {
      Alert.alert(t('error'), t('locationUpdateFailed'));
    }
  }

  async function openProductLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('invalidLink'), t('openLinkFailed'));
    }
  }

  async function rateOrderMember(orderId: string, targetUserName: string, score: number, comment: string) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }
    if (score < 1 || score > 5 || comment.trim().length < 2) {
      Alert.alert(t('incompleteRating'), t('incompleteRatingMessage'));
      return;
    }
    try {
      await fetchJson(`${API_BASE_URL}/orders/${orderId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ target_user_name: targetUserName, score, comment: comment.trim() }),
      });
      await loadMyOrders();
      Alert.alert(t('ratingSaved'), t('ratingSavedMessage'));
    } catch {
      Alert.alert(t('error'), t('ratingFailed'));
    }
  }

  async function resolveCapacityRequest(orderId: string, requestId: string, approve: boolean) {
    if (apiStatus !== 'online' || !authToken) {
      Alert.alert('Backend/Auth', t('authRequired'));
      return;
    }
    try {
      await fetchJson(`${API_BASE_URL}/orders/${orderId}/capacity-requests/${requestId}?approve=${approve}`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      await Promise.all([loadMyOrders(), loadNearbyOrders(), loadNotifications()]);
      Alert.alert(t('extraSpotResolved'));
    } catch {
      Alert.alert(t('error'), t('extraSpotResolveFailed'));
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.screen, styles.androidStatusBarInset]}>
      <ExpoStatusBar style="light" />
      <View style={[styles.header, tabletWidthStyle]}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>CartBuddy</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setIsHelpOpen(true)} style={styles.headerHelpButton}>
              <Text style={styles.headerHelpText}>ⓘ {t('help')}</Text>
            </Pressable>
            <Pressable
              onPress={() => changeLanguage(language === 'ro' ? 'en' : 'ro')}
              style={styles.headerLanguageButton}
            >
              <Text style={styles.headerLanguageText}>{language.toUpperCase()} {'\u{1F310}'}</Text>
            </Pressable>
          </View>
        </View>
        <HelpModal language={language} visible={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        <Text style={styles.subtitle}>{t('commonOrdersSubtitle')}</Text>
      </View>

      {currentUser && (
        <View style={[styles.userRow, tabletWidthStyle]}>
          <Text style={styles.userText}>{t('loggedIn')}: {currentUser.display_name}</Text>
          <View style={styles.userActionsRow}>
            <Text style={styles.headerNotifBadge}>{unreadNotificationsCount} notif</Text>
            <Pressable onPress={logout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>{t('logout')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {activeTab !== 'home' && currentUser && (
        <View style={[styles.topNav, tabletWidthStyle]}>
          <Pressable onPress={() => setActiveTab('home')} style={styles.backButton}>
            <Text style={styles.backButtonText}>{t('backHome')}</Text>
          </Pressable>
        </View>
      )}

      {locationState === 'loading' && (
        <View style={[styles.locationNotice, tabletWidthStyle]}>
          <ActivityIndicator color="#84cc16" />
          <Text style={styles.noticeText}>{t('detectingLocation')}</Text>
        </View>
      )}

      {locationState === 'fallback' && (
        <View style={[styles.locationWarning, tabletWidthStyle]}>
          <Text style={styles.warningText}>
            {t('fallbackLocation')}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.content, isTabletLayout && styles.tabletContent]}>
        {isRestoringAuth ? (
          <View style={styles.authCard}>
            <ActivityIndicator color="#84cc16" />
            <Text style={styles.emptyState}>{t('restoringSession')}</Text>
          </View>
        ) : !currentUser ? (
          <AuthSection
            language={language}
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
          />
        ) : activeTab === 'home' ? (
          <HomeSection
            language={language}
            unreadNotificationsCount={unreadNotificationsCount}
            notifications={notifications}
            isLoadingNotifications={isLoadingNotifications}
            onOpenNearby={() => setActiveTab('nearby')}
            onOpenCreate={() => setActiveTab('create')}
            onOpenMyOrders={() => {
              setActiveTab('myorders');
              void loadMyOrders();
            }}
            onOpenProfile={() => setActiveTab('profile')}
            onRefreshNotifications={loadNotifications}
            onMarkNotificationRead={markNotificationRead}
            onDeleteNotifications={confirmDeleteNotifications}
          />
        ) : activeTab === 'profile' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('profile')}</Text>
            <Text style={styles.profileLabel}>{t('language')}</Text>
            <View style={[styles.chipWrap, styles.profileLanguageOptions]}>
              {LANGUAGES.map((item) => (
                <ChipButton
                  key={item.value}
                  label={item.label}
                  selected={language === item.value}
                  onPress={() => changeLanguage(item.value)}
                />
              ))}
            </View>
            <View style={styles.profileInfoBox}>
              <Text style={styles.profileLabel}>{t('email')}</Text>
              <Text style={styles.profileValue}>{currentUser.email}</Text>
            </View>
            <View style={styles.profileInfoBox}>
              <Text style={styles.profileLabel}>{t('displayName')}</Text>
              <Text style={styles.profileValue}>{currentUser.display_name}</Text>
            </View>
            <Pressable onPress={toggleMyRatings} style={styles.profileRatingsButton}>
              <Text style={styles.profileRatingsButtonText}>
                {isMyRatingsOpen ? t('hideMyRatings') : t('viewMyRatings')}
              </Text>
            </Pressable>
            {isMyRatingsOpen && (
              <View style={styles.profileRatingsSection}>
                <Text style={styles.sectionTitle}>{t('myRatingsAndReviews')}</Text>
                {isLoadingMyRatings ? (
                  <ActivityIndicator color="#84cc16" />
                ) : !myRatingSummary || (myRatingSummary.organizer_count === 0 && myRatingSummary.participant_count === 0) ? (
                  <Text style={styles.smallNote}>{t('noReviewsYet')}</Text>
                ) : (
                  <View style={styles.profileInfoBox}>
                    {myRatingSummary.organizer_count > 0 && (
                      <Text style={styles.profileRatingValue}>
                        {t('organizerRating')}: ★ {myRatingSummary.organizer_average}/5 ({myRatingSummary.organizer_count})
                      </Text>
                    )}
                    {myRatingSummary.participant_count > 0 && (
                      <Text style={styles.profileRatingValue}>
                        {t('participantRating')}: ★ {myRatingSummary.participant_average}/5 ({myRatingSummary.participant_count})
                      </Text>
                    )}
                    <Text style={styles.profileLabel}>{t('receivedReviews')}</Text>
                    {(myRatingSummary.recent_comments ?? []).map((review, index) => (
                      <View key={`${review.created_at}-${index}`} style={styles.profileReviewRow}>
                        <Text style={styles.profileValue}>★ {review.score}/5 — {review.reviewer_name}</Text>
                        <Text style={styles.smallNote}>“{review.comment}”</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            <Text style={styles.profileLabel}>{t('phoneNumber')}</Text>
            <TextInput
              value={profilePhone}
              onChangeText={setProfilePhone}
              placeholder={t('addPhone')}
              placeholderTextColor="#94a3b8"
              style={styles.input}
              keyboardType="phone-pad"
            />
            <Text style={styles.profileLabel}>{t('address')}</Text>
            <TextInput
              value={profileAddress}
              onChangeText={setProfileAddress}
              placeholder={t('mainAddress')}
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.multilineInput]}
              multiline
            />
            <Text style={styles.smallNote}>
              {t('profileGpsNote')}
            </Text>
            <Pressable
              onPress={saveProfile}
              style={[styles.primaryButton, isProfileSaving && styles.disabledButton]}
              disabled={isProfileSaving}
            >
              <Text style={styles.primaryButtonText}>
                {isProfileSaving ? t('saving') : t('saveProfile')}
              </Text>
            </Pressable>
          </View>
        ) : activeTab === 'myorders' ? (
          <View style={styles.card}>
            <View style={styles.myOrdersHeader}>
              <Text style={styles.sectionTitle}>{t('myOrders')}</Text>
              <Pressable onPress={loadMyOrders}>
                <Text style={styles.inlineAction}>{t('refresh')}</Text>
              </Pressable>
            </View>
            <Text style={styles.smallNote}>{t('myOrdersDescription')}</Text>

            {isLoadingMyOrders ? (
              <ActivityIndicator color="#84cc16" />
            ) : myOrders.length === 0 ? (
              <Text style={styles.emptyState}>{t('noMyOrders')}</Text>
            ) : (
              <View style={styles.ordersSection}>
                {myOrders.map((order) => (
                  <MyOrderCard
                    key={order.id}
                    language={language}
                    order={order}
                    currentUserName={currentUser.display_name}
                    onExtend={extendOrder}
                    onStatusChange={updateOrderStatus}
                    onCostsChange={updateOrderCosts}
                    onLocationChange={updateOrderLocation}
                    onRate={rateOrderMember}
                    isProductsOpen={expandedLinksOrderIds.has(order.id)}
                    productLinks={orderLinksByOrderId[order.id] ?? []}
                    isLoadingProducts={Boolean(loadingLinksByOrderId[order.id])}
                    onToggleProducts={toggleOrderLinks}
                    onOpenProduct={openProductLink}
                    onResolveCapacityRequest={resolveCapacityRequest}
                  />
                ))}
              </View>
            )}
          </View>
        ) : activeTab === 'create' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('choosePlatform')}</Text>
            <View style={styles.chipWrap}>
              {platforms.map((platform) => (
                <ChipButton
                  key={platform}
                  label={platform}
                  selected={selectedPlatform === platform}
                  onPress={() => setSelectedPlatform(platform)}
                />
              ))}
              <ChipButton
                key={OTHER_PLATFORMS}
                label={t('otherPlatforms')}
                selected={selectedPlatform === OTHER_PLATFORMS}
                onPress={() => setSelectedPlatform(OTHER_PLATFORMS)}
              />
            </View>
            {selectedPlatform === OTHER_PLATFORMS && (
              <>
                <Text style={styles.profileLabel}>{t('customPlatform')}</Text>
                <TextInput
                  value={customPlatformName}
                  onChangeText={setCustomPlatformName}
                  placeholder={t('customPlatformPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  autoCapitalize="words"
                />
              </>
            )}

            <Text style={styles.sectionTitle}>{t('waitPeriod')}</Text>
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

            <Text style={styles.sectionTitle}>{t('minBuddy')}</Text>
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

            <Text style={styles.sectionTitle}>{t('matchingRadius')}</Text>
            <Text style={styles.profileLabel}>{t('orderLocation')}</Text>
            <View style={styles.chipWrap}>
              <ChipButton
                label={t('currentLocation')}
                selected={orderLocationMode === 'current'}
                onPress={() => setOrderLocationMode('current')}
              />
              <ChipButton
                label={t('chooseOnMap')}
                selected={orderLocationMode === 'custom'}
                onPress={() => {
                  const initial = customOrderLocation ?? myLocation ?? {
                    latitude: currentUser.latitude,
                    longitude: currentUser.longitude,
                  };
                  setCustomOrderLocation(initial);
                  setIsOrderLocationPickerOpen(true);
                }}
              />
            </View>
            {orderLocationMode === 'custom' && customOrderLocation && (
              <Pressable onPress={() => setIsOrderLocationPickerOpen(true)} style={styles.locationSelectionBox}>
                <Text style={styles.profileValue}>{t('selectedLocation')}</Text>
                <Text style={styles.smallNote}>
                  {customOrderLocation.latitude.toFixed(5)}, {customOrderLocation.longitude.toFixed(5)}
                </Text>
              </Pressable>
            )}
            {customOrderLocation && (
              <OrderLocationPicker
                language={language}
                visible={isOrderLocationPickerOpen}
                value={customOrderLocation}
                onChange={setCustomOrderLocation}
                onClose={() => setIsOrderLocationPickerOpen(false)}
                onConfirm={() => {
                  setOrderLocationMode('custom');
                  setIsOrderLocationPickerOpen(false);
                }}
              />
            )}
            <RadiusBarSelector language={language} value={selectedRadius} onChange={setSelectedRadius} />

            <Text style={styles.sectionTitle}>{t('orderCosts')}</Text>
            <Text style={styles.profileLabel}>{t('currency')}</Text>
            <Pressable
              onPress={() => setIsCurrencyDropdownOpen((open) => !open)}
              style={styles.currencyDropdownButton}
            >
              <Text style={styles.currencyDropdownText}>
                {CURRENCIES.find((item) => item.code === selectedCurrency)?.symbol} {selectedCurrency} ▾
              </Text>
            </Pressable>
            {isCurrencyDropdownOpen && (
              <View style={styles.currencyDropdownList}>
                {CURRENCIES.map((item) => (
                  <Pressable
                    key={item.code}
                    onPress={() => {
                      setSelectedCurrency(item.code);
                      setIsCurrencyDropdownOpen(false);
                    }}
                    style={[styles.currencyOption, selectedCurrency === item.code && styles.currencyOptionSelected]}
                  >
                    <Text style={styles.currencyDropdownText}>
                      {item.symbol}  {item.code} — {item[language]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.profileLabel}>{t('deliveryFee')} *</Text>
            <TextInput
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              placeholder={`0.00 ${selectedCurrency}`}
              placeholderTextColor="#94a3b8"
              style={styles.input}
              keyboardType="decimal-pad"
            />
            <Text style={styles.profileLabel}>{t('processingFee')} *</Text>
            <TextInput
              value={processingFee}
              onChangeText={setProcessingFee}
              placeholder={`0.00 ${selectedCurrency}`}
              placeholderTextColor="#94a3b8"
              style={styles.input}
              keyboardType="decimal-pad"
            />
            <Text style={styles.profileLabel}>{t('minimumOrderValue')}</Text>
            <TextInput
              value={minimumOrderValue}
              onChangeText={setMinimumOrderValue}
              placeholder={`${t('optional')} · 0.00 ${selectedCurrency}`}
              placeholderTextColor="#94a3b8"
              style={styles.input}
              keyboardType="decimal-pad"
            />

            <Pressable onPress={createOrder} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('publishOrder')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('filters')}</Text>
            <View style={styles.chipWrap}>
              <ChipButton
                key={ALL_PLATFORMS}
                label={t('allPlatforms')}
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
              <ChipButton
                key={OTHER_PLATFORMS}
                label={t('otherPlatforms')}
                selected={nearbyPlatformFilter === OTHER_PLATFORMS}
                onPress={() => setNearbyPlatformFilter(OTHER_PLATFORMS)}
              />
            </View>

            <Text style={styles.sectionTitle}>{t('searchRadius')}</Text>
            <RadiusBarSelector language={language} value={nearbyRadiusFilter} onChange={setNearbyRadiusFilter} />
            <Text style={styles.smallNote}>
              {t('smartSorting')}
            </Text>

            <Pressable onPress={loadNearbyOrders} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>{t('refresh')}</Text>
            </Pressable>
            <View style={styles.mapActionsRow}>
              <Pressable
                onPress={() => setIsNearbyMapOpen((value) => !value)}
                style={styles.mapToggleButton}
              >
                <Text style={styles.mapToggleButtonText}>{isNearbyMapOpen ? t('showList') : t('openMap')}</Text>
              </Pressable>
              <Pressable
                onPress={openNearbyOrdersInGoogleMaps}
                style={styles.mapToggleButton}
              >
                <Text style={styles.mapToggleButtonText}>{t('openGoogleMaps')}</Text>
              </Pressable>
            </View>

            <View style={styles.ordersSection}>
              {isLoadingOrders ? (
                <ActivityIndicator color="#84cc16" />
              ) : orders.length === 0 ? (
                <Text style={styles.emptyState}>
                  {t('noNearbyOrders')}
                </Text>
              ) : isNearbyMapOpen && myLocation ? (
                <OrdersMap
                  language={language}
                  orders={orders}
                  userLocation={myLocation}
                  radiusMeters={nearbyRadiusFilter}
                />
              ) : (
                orders.map((order) => (
                  <NearbyOrderCard
                    key={order.id}
                    language={language}
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
                    onRequestExtraSpot={requestExtraSpot}
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
    </SafeAreaProvider>
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  headerLanguageButton: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerHelpButton: {
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#111827',
  },
  headerHelpText: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '800',
  },
  headerLanguageText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '800',
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
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#132b02',
    fontWeight: '800',
    fontSize: 15,
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
  currencyDropdownButton: {
    borderWidth: 1,
    borderColor: '#84cc16',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#0b1220',
  },
  currencyDropdownList: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0b1220',
  },
  currencyOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  currencyOptionSelected: {
    backgroundColor: '#365314',
  },
  currencyDropdownText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  multilineInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  profileInfoBox: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0b1220',
    gap: 3,
    marginBottom: 8,
  },
  locationSelectionBox: {
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 10,
    backgroundColor: '#0b1220',
    padding: 10,
    marginBottom: 8,
  },
  profileLanguageOptions: {
    marginTop: 10,
    marginBottom: 8,
  },
  profileLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  profileValue: {
    color: '#f8fafc',
    fontSize: 14,
  },
  profileRatingsButton: {
    borderWidth: 1,
    borderColor: '#84cc16',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  profileRatingsButtonText: {
    color: '#d9f99d',
    fontWeight: '800',
  },
  profileRatingsSection: {
    gap: 8,
    marginBottom: 10,
  },
  profileRatingValue: {
    color: '#fef08a',
    fontSize: 14,
    fontWeight: '800',
  },
  profileReviewRow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    marginTop: 6,
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
  mapActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  mapToggleButton: {
    flex: 1,
    borderRadius: 10,
    borderColor: '#38bdf8',
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  mapToggleButtonText: {
    color: '#bae6fd',
    fontWeight: '800',
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
