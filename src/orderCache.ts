import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OrderMessageItem, ProductLinkItem } from './types';

const LINKS_CACHE_PREFIX = 'cartbuddy_order_links:';
const MESSAGES_CACHE_PREFIX = 'cartbuddy_order_messages:';

export async function getCachedOrderLinks(orderId: string): Promise<ProductLinkItem[] | null> {
  return getCachedJson<ProductLinkItem[]>(`${LINKS_CACHE_PREFIX}${orderId}`);
}

export async function cacheOrderLinks(orderId: string, items: ProductLinkItem[]): Promise<void> {
  await setCachedJson(`${LINKS_CACHE_PREFIX}${orderId}`, items);
}

export async function getCachedOrderMessages(orderId: string): Promise<OrderMessageItem[] | null> {
  return getCachedJson<OrderMessageItem[]>(`${MESSAGES_CACHE_PREFIX}${orderId}`);
}

export async function cacheOrderMessages(orderId: string, items: OrderMessageItem[]): Promise<void> {
  await setCachedJson(`${MESSAGES_CACHE_PREFIX}${orderId}`, items);
}

async function getCachedJson<T>(key: string): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

async function setCachedJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache failures should not affect network-backed order flows.
  }
}
