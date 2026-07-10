import type { OrderItem } from './types';
import type { Language } from './i18n';
import { translate } from './i18n';

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

export function labelRadius(radius: number): string {
  return radius < 1000 ? `${radius}m` : `${radius / 1000}km`;
}

export function timeLeftLabel(expiresAtIso: string, language: Language = 'ro'): string {
  const now = Date.now();
  const expires = new Date(expiresAtIso).getTime();
  const diffMs = expires - now;
  if (diffMs <= 0) {
    return translate(language, 'expired');
  }
  const totalHours = Math.ceil(diffMs / 3600000);
  if (totalHours < 24) {
    return `${totalHours} ${translate(language, 'hoursLeft')}`;
  }
  const days = Math.ceil(totalHours / 24);
  return `${days} ${translate(language, 'daysLeft')}`;
}

export function reservationTimeLeftLabel(expiresAtIso: string | null, language: Language = 'ro'): string {
  if (!expiresAtIso) {
    return '';
  }
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return translate(language, 'expiredShort');
  }
  const totalMinutes = Math.ceil(diffMs / 60000);
  return `${totalMinutes} min`;
}

export function notificationTimeLabel(createdAtIso: string, language: Language = 'ro'): string {
  const diffMs = Date.now() - new Date(createdAtIso).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return translate(language, 'now');
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h`;
  }
  return `${Math.floor(diffHours / 24)} ${translate(language, 'days')}`;
}

export function statusLabel(status: OrderItem['status'], language: Language = 'ro'): string {
  if (status === 'open') {
    return translate(language, 'statusOpen');
  }
  if (status === 'expired') {
    return translate(language, 'statusExpired');
  }
  if (status === 'ready_to_order') {
    return translate(language, 'statusReady');
  }
  if (status === 'ordered') {
    return translate(language, 'statusOrdered');
  }
  if (status === 'delivered') {
    return translate(language, 'statusDelivered');
  }
  if (status === 'cancelled') {
    return translate(language, 'statusCancelled');
  }
  return translate(language, 'statusClosed');
}
