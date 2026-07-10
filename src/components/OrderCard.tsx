import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { JOIN_RESERVATION_MINUTES, MAX_PRODUCT_LINK_SLOTS } from '../constants';
import {
  formatDistance,
  notificationTimeLabel,
  reservationTimeLeftLabel,
  statusLabel,
  timeLeftLabel,
} from '../formatters';
import { translate, type Language, type TranslationKey } from '../i18n';
import type { OrderItem, OrderMessageItem, OrderStatus, ProductLinkItem } from '../types';

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', RON: 'lei', GBP: '£', MDL: 'L', CHF: 'CHF',
  CAD: 'C$', AUD: 'A$', JPY: '¥', CNY: '¥', PLN: 'zł', HUF: 'Ft', TRY: '₺',
};

function formatMoney(value: number, currency: string): string {
  const amount = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(value);
  return `${amount} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

function OrderCosts({ language, order }: { language: Language; order: OrderItem }) {
  const t = (key: TranslationKey) => translate(language, key);
  return (
    <View>
      <Text style={styles.orderMeta}>{t('deliveryFee')}: {formatMoney(order.delivery_fee, order.currency)}</Text>
      <Text style={styles.orderMeta}>{t('processingFee')}: {formatMoney(order.processing_fee, order.currency)}</Text>
      {order.minimum_order_value !== null && (
        <Text style={styles.orderMeta}>{t('minimumOrderValue')}: {formatMoney(order.minimum_order_value, order.currency)}</Text>
      )}
    </View>
  );
}

type MyOrderCardProps = {
  language: Language;
  order: OrderItem;
  onExtend: (orderId: string) => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
};

export function MyOrderCard({ language, order, onExtend, onStatusChange }: MyOrderCardProps) {
  const t = (key: TranslationKey) => translate(language, key);
  const canExtend = order.status === 'expired' && !order.extended_once;
  const canUpdateStatus = !['delivered', 'cancelled'].includes(order.status);

  return (
    <View style={styles.orderCard}>
      <Text style={styles.orderTitle}>{order.platform}</Text>
      <Text style={styles.orderMeta}>{t('status')}: {statusLabel(order.status, language)}</Text>
      <Text style={styles.orderMeta}>
        {t('participants')}: {order.current_people}/{order.min_people}
      </Text>
      <Text style={styles.orderMeta}>{t('interval')}: {order.max_wait_days} {t('days')}</Text>
      <Text style={styles.orderMeta}>{t('timeLeft')}: {timeLeftLabel(order.expires_at, language)}</Text>
      <Text style={styles.orderMeta}>{t('extensionUsed')}: {order.extended_once ? t('yes') : t('no')}</Text>
      <OrderCosts language={language} order={order} />

      {canExtend && (
        <Pressable onPress={() => onExtend(order.id)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('extend10Days')}</Text>
        </Pressable>
      )}

      {canUpdateStatus && (
        <View style={styles.statusActionsRow}>
          <Pressable onPress={() => onStatusChange(order.id, 'ready_to_order')} style={styles.smallStatusButton}>
            <Text style={styles.smallStatusButtonText}>{t('ready')}</Text>
          </Pressable>
          <Pressable onPress={() => onStatusChange(order.id, 'ordered')} style={styles.smallStatusButton}>
            <Text style={styles.smallStatusButtonText}>{t('ordered')}</Text>
          </Pressable>
          <Pressable onPress={() => onStatusChange(order.id, 'delivered')} style={styles.smallStatusButton}>
            <Text style={styles.smallStatusButtonText}>{t('delivered')}</Text>
          </Pressable>
          <Pressable onPress={() => onStatusChange(order.id, 'cancelled')} style={styles.smallDangerButton}>
            <Text style={styles.smallDangerButtonText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

type NearbyOrderCardProps = {
  language: Language;
  order: OrderItem;
  currentUserName: string;
  isJoined: boolean;
  reservationExpiresAt: string | null;
  isLinksOpen: boolean;
  links: ProductLinkItem[];
  linkDraft: string;
  isLoadingLinks: boolean;
  slotsUsed: number;
  isChatOpen: boolean;
  messages: OrderMessageItem[];
  messageDraft: string;
  isLoadingMessages: boolean;
  onJoin: (orderId: string) => void;
  onToggleLinks: (orderId: string) => void;
  onLinkDraftChange: (orderId: string, value: string) => void;
  onAddProductLink: (orderId: string) => void;
  onProcessLink: (orderId: string, link: ProductLinkItem) => void;
  onToggleChat: (orderId: string) => void;
  onRefreshMessages: (orderId: string) => void;
  onMessageDraftChange: (orderId: string, value: string) => void;
  onSendMessage: (orderId: string) => void;
};

export function NearbyOrderCard({
  language,
  order,
  currentUserName,
  isJoined,
  reservationExpiresAt,
  isLinksOpen,
  links,
  linkDraft,
  isLoadingLinks,
  slotsUsed,
  isChatOpen,
  messages,
  messageDraft,
  isLoadingMessages,
  onJoin,
  onToggleLinks,
  onLinkDraftChange,
  onAddProductLink,
  onProcessLink,
  onToggleChat,
  onRefreshMessages,
  onMessageDraftChange,
  onSendMessage,
}: NearbyOrderCardProps) {
  const t = (key: TranslationKey) => translate(language, key);
  const effectivePeople = order.current_people + order.reserved_people;
  const reachedMin = effectivePeople >= order.min_people;
  const isOwnOrder = currentUserName === order.created_by;
  const isReservationActive = reservationExpiresAt
    ? new Date(reservationExpiresAt).getTime() > Date.now()
    : false;
  const isReserved = !isJoined && !isOwnOrder && isReservationActive;
  const isOrderFull = order.available_slots <= 0;
  const canJoin = order.status === 'open' && !isOwnOrder && !isJoined && !isOrderFull;
  const canManageLinks = isOwnOrder || isJoined;
  const canAddLinks = order.status === 'open' || order.status === 'ready_to_order';
  const canSendMessages = order.status !== 'delivered' && order.status !== 'cancelled';
  const slotsLeftForLinks = Math.max(MAX_PRODUCT_LINK_SLOTS - slotsUsed, 0);
  const matchPercent =
    order.priority_score === null
      ? null
      : Math.max(1, Math.min(99, Math.round((1 - order.priority_score) * 100)));

  return (
    <View style={styles.orderCard}>
      <Text style={styles.orderTitle}>{order.platform}</Text>
      <Text style={styles.orderMeta}>{t('initiatedBy')}: {order.created_by}</Text>
      {matchPercent !== null && <Text style={styles.orderMeta}>{t('matchScore')}: {matchPercent}%</Text>}
      <Text style={styles.orderMeta}>
        {t('distance')}: {order.distance_meters === null ? '-' : formatDistance(order.distance_meters)}
      </Text>
      <Text style={styles.orderMeta}>
        {t('confirmedParticipants')}: {order.current_people}/{order.min_people}
      </Text>
      <Text style={styles.orderMeta}>{t('activeReservations')}: {order.reserved_people}</Text>
      <Text style={styles.orderMeta}>{t('availableSlots')}: {order.available_slots}</Text>
      <Text style={styles.orderMeta}>{t('timeLeft')}: {timeLeftLabel(order.expires_at, language)}</Text>
      <OrderCosts language={language} order={order} />
      {isReserved && (
        <Text style={styles.orderMeta}>
          {t('reservedSpot')}: {reservationTimeLeftLabel(reservationExpiresAt, language)}
        </Text>
      )}

      <Text style={[styles.statusTag, reachedMin ? styles.statusOk : styles.statusWait]}>
        {reachedMin ? t('minReached') : t('lookingForMembers')}
      </Text>

      <Pressable
        onPress={() => onJoin(order.id)}
        style={[styles.secondaryButton, !canJoin && styles.disabledButton]}
        disabled={!canJoin}
      >
        <Text style={styles.secondaryButtonText}>
          {isOwnOrder
            ? t('yourOrder')
            : isJoined
              ? t('joined')
              : isReserved
                ? `${t('confirmIn')} ${reservationTimeLeftLabel(reservationExpiresAt, language)}`
                : order.status !== 'open'
                  ? t('noLongerAccepting')
                  : isOrderFull
                  ? t('noSlots')
                  : `${t('reserveSpot')} (${JOIN_RESERVATION_MINUTES} min)`}
        </Text>
      </Pressable>

      {canManageLinks && (
        <View style={styles.panelCard}>
          <Pressable onPress={() => onToggleChat(order.id)} style={styles.panelToggleButton}>
            <Text style={styles.panelToggleText}>
              {isChatOpen ? t('hideChat') : t('orderChat')}
            </Text>
          </Pressable>

          {isChatOpen && (
            <View style={styles.panelBody}>
              <View style={styles.chatHeaderRow}>
                <Text style={styles.chatHeaderText}>{t('messages')}</Text>
                <Pressable onPress={() => onRefreshMessages(order.id)}>
                  <Text style={styles.inlineAction}>{t('refresh')}</Text>
                </Pressable>
              </View>
              {isLoadingMessages ? (
                <ActivityIndicator color="#84cc16" />
              ) : messages.length === 0 ? (
                <Text style={styles.emptyState}>{t('noMessages')}</Text>
              ) : (
                messages.map((message) => {
                  const isMine = message.user_name === currentUserName;
                  return (
                    <View key={message.id} style={[styles.messageBubble, isMine && styles.messageBubbleMine]}>
                      <Text style={styles.messageAuthor}>{message.user_name}</Text>
                      <Text style={styles.messageText}>{message.message}</Text>
                      <Text style={styles.messageTime}>{notificationTimeLabel(message.created_at, language)}</Text>
                    </View>
                  );
                })
              )}
              {canSendMessages ? (
                <>
                  <TextInput
                    value={messageDraft}
                    onChangeText={(value) => onMessageDraftChange(order.id, value)}
                    placeholder={t('writeMessage')}
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    multiline
                  />
                  <Pressable onPress={() => onSendMessage(order.id)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>{t('sendMessage')}</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.emptyState}>{t('readonlyChat')}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {canManageLinks && (
        <View style={styles.panelCard}>
          <Pressable onPress={() => onToggleLinks(order.id)} style={styles.panelToggleButton}>
            <Text style={styles.panelToggleText}>
              {isLinksOpen ? t('hideLinks') : t('manageProductLinks')}
            </Text>
          </Pressable>

          {isLinksOpen && (
            <View style={styles.panelBody}>
              <Text style={styles.orderMeta}>
                {t('usedSlots')}: {slotsUsed}/{MAX_PRODUCT_LINK_SLOTS}
              </Text>
              {isLoadingLinks ? (
                <ActivityIndicator color="#84cc16" />
              ) : links.length === 0 ? (
                <Text style={styles.emptyState}>{t('noLinksYet')}</Text>
              ) : (
                links.map((link, idx) => (
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
                          <Text style={styles.linkStatusText}>{link.processed ? t('inCart') : t('needsReview')}</Text>
                        </View>
                        <Text style={styles.linkMetaText}>
                          {link.processed
                            ? `${t('processed')}${link.processed_by ? ` ${t('processedBy').toLowerCase()} ${link.processed_by}` : ''}`
                            : t('waitsProcessing')}
                        </Text>
                      </View>
                    </View>
                    {isOwnOrder && link.user_name !== currentUserName && !link.processed && (
                      <Pressable onPress={() => onProcessLink(order.id, link)} style={styles.linkPlusButton}>
                        <Text style={styles.linkPlusText}>+</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}

              {!canAddLinks ? (
                <Text style={styles.emptyState}>{t('readonlyLinks')}</Text>
              ) : slotsLeftForLinks > 0 ? (
                <>
                  <TextInput
                    value={linkDraft}
                    onChangeText={(value) => onLinkDraftChange(order.id, value)}
                    placeholder={t('productLinkPlaceholder')}
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => onAddProductLink(order.id)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>{t('addProductLink')}</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.emptyState}>{t('allLinkSlotsUsed')}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  panelCard: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    gap: 8,
  },
  panelToggleButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: '#111827',
  },
  panelToggleText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
  },
  panelBody: {
    gap: 8,
  },
  messageBubble: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#111827',
    gap: 2,
  },
  messageBubbleMine: {
    borderColor: '#84cc16',
    backgroundColor: '#13220f',
  },
  messageAuthor: {
    color: '#d9f99d',
    fontSize: 11,
    fontWeight: '800',
  },
  messageText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  messageTime: {
    color: '#64748b',
    fontSize: 10,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatHeaderText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '800',
  },
  inlineAction: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '700',
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
  statusActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  smallStatusButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#84cc16',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  smallStatusButtonText: {
    color: '#d9f99d',
    fontSize: 11,
    fontWeight: '800',
  },
  smallDangerButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fda4af',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  smallDangerButtonText: {
    color: '#ffe4e6',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyState: {
    color: '#94a3b8',
    fontSize: 13,
  },
});
