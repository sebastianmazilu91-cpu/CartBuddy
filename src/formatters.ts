import type { OrderItem } from './types';

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

export function labelRadius(radius: number): string {
  return radius < 1000 ? `${radius}m` : `${radius / 1000}km`;
}

export function timeLeftLabel(expiresAtIso: string): string {
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

export function reservationTimeLeftLabel(expiresAtIso: string | null): string {
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

export function notificationTimeLabel(createdAtIso: string): string {
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

export function statusLabel(status: OrderItem['status']): string {
  if (status === 'open') {
    return 'Activa';
  }
  if (status === 'expired') {
    return 'Expirata';
  }
  if (status === 'ready_to_order') {
    return 'Gata de comandat';
  }
  if (status === 'ordered') {
    return 'Comandata';
  }
  if (status === 'delivered') {
    return 'Livrata';
  }
  if (status === 'cancelled') {
    return 'Anulata';
  }
  return 'Inchisa';
}
