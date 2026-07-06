import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { notificationTimeLabel } from '../formatters';
import type { NotificationItem } from '../types';

type HomeSectionProps = {
  unreadNotificationsCount: number;
  notifications: NotificationItem[];
  isLoadingNotifications: boolean;
  onOpenNearby: () => void;
  onOpenCreate: () => void;
  onRefreshNotifications: () => void;
  onMarkNotificationRead: (notificationId: string) => void;
};

export function HomeSection({
  unreadNotificationsCount,
  notifications,
  isLoadingNotifications,
  onOpenNearby,
  onOpenCreate,
  onRefreshNotifications,
  onMarkNotificationRead,
}: HomeSectionProps) {
  return (
    <View style={styles.homeCard}>
      <Text style={styles.homeTitle}>Home</Text>
      <Text style={styles.homeSubtitle}>Alege ce vrei sa faci:</Text>

      <Pressable onPress={onOpenNearby} style={styles.homeActionPrimary}>
        <Text style={styles.homeActionPrimaryText}>Cauta comenzi</Text>
      </Pressable>

      <Pressable onPress={onOpenCreate} style={styles.homeActionSecondary}>
        <Text style={styles.homeActionSecondaryText}>Plaseaza o comanda</Text>
      </Pressable>

      <View style={styles.notificationsCard}>
        <View style={styles.notificationsHeader}>
          <Text style={styles.notificationsTitle}>Notificari</Text>
          <View style={styles.notificationsHeaderActions}>
            <Text style={styles.notificationsBadge}>{unreadNotificationsCount} necitite</Text>
            <Pressable onPress={onRefreshNotifications}>
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
                  onPress={() => onMarkNotificationRead(notification.id)}
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
  );
}

const styles = StyleSheet.create({
  homeCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
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
  inlineAction: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    color: '#94a3b8',
    fontSize: 13,
  },
});
