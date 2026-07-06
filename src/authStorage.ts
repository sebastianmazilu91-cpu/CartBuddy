import * as SecureStore from 'expo-secure-store';

import type { User } from './types';

const AUTH_TOKEN_KEY = 'cartbuddy_auth_token';
const AUTH_USER_KEY = 'cartbuddy_auth_user';

export async function saveAuthSession(token: string, user: User): Promise<void> {
  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    // Keep login usable even if secure storage is unavailable in the current runtime.
  }
}

export async function getStoredAuthSession(): Promise<{ token: string; user: User } | null> {
  try {
    const [storedToken, storedUser] = await Promise.all([
      SecureStore.getItemAsync(AUTH_TOKEN_KEY),
      SecureStore.getItemAsync(AUTH_USER_KEY),
    ]);
    if (!storedToken || !storedUser) {
      return null;
    }
    return { token: storedToken, user: JSON.parse(storedUser) as User };
  } catch {
    await clearStoredAuthSession();
    return null;
  }
}

export async function clearStoredAuthSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(AUTH_USER_KEY);
  } catch {
    // Logout should still clear in-memory auth state if secure storage fails.
  }
}
