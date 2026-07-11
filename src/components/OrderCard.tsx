import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JOIN_RESERVATION_MINUTES, MAX_PRODUCT_LINK_SLOTS } from '../constants';
import {
  formatDistance,
  notificationTimeLabel,
  reservationTimeLeftLabel,
  statusLabel,
  timeLeftLabel,
} from '../formatters';
import { translate, type Language, type TranslationKey } from '../i18n';
import type { OrderItem, OrderMessageItem, OrderStatus, ProductLinkItem, UserRatingSummary } from '../types';
import { OrderLocationPicker } from './OrderLocationPicker';

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
  const sharedFeesPerParticipant =
    (order.delivery_fee + order.processing_fee) / Math.max(order.current_people, 1);
  return (
    <View>
      <Text style={styles.orderMeta}>{t('deliveryFee')}: {formatMoney(order.delivery_fee, order.currency)}</Text>
      <Text style={styles.orderMeta}>{t('processingFee')}: {formatMoney(order.processing_fee, order.currency)}</Text>
      <Text style={styles.sharedCostText}>
        {t('sharedFeesPerParticipant')}: {formatMoney(sharedFeesPerParticipant, order.currency)}
      </Text>
      {order.minimum_order_value !== null && (
        <Text style={styles.orderMeta}>{t('minimumOrderValue')}: {formatMoney(order.minimum_order_value, order.currency)}</Text>
      )}
    </View>
  );
}

function RatingSummary({ language, summary }: { language: Language; summary: UserRatingSummary | null }) {
  const t = (key: TranslationKey) => translate(language, key);
  if (!summary || (summary.organizer_count === 0 && summary.participant_count === 0)) {
    return <Text style={styles.noRatings}>{t('noRatingsYet')}</Text>;
  }
  return (
    <View style={styles.publicRatingBox}>
      {summary.organizer_count > 0 && (
        <Text style={styles.ratingAverage}>
          {t('organizerRating')}: ★ {summary.organizer_average}/5 ({summary.organizer_count})
        </Text>
      )}
      {summary.participant_count > 0 && (
        <Text style={styles.ratingAverage}>
          {t('participantRating')}: ★ {summary.participant_average}/5 ({summary.participant_count})
        </Text>
      )}
      {(summary.recent_comments ?? []).map((item, index) => (
        <Text key={`${item.created_at}-${index}`} style={styles.publicComment}>
          “{item.comment}” — {item.reviewer_name}, {item.score}/5
        </Text>
      ))}
    </View>
  );
}

type MyOrderCardProps = {
  language: Language;
  order: OrderItem;
  currentUserName: string;
  onExtend: (orderId: string) => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onCostsChange: (orderId: string, deliveryFee: number, processingFee: number, minimumOrderValue: number | null) => void;
  onLocationChange: (orderId: string, latitude: number, longitude: number) => void;
  onRate: (orderId: string, targetUserName: string, score: number, comment: string) => void;
  isProductsOpen: boolean;
  productLinks: ProductLinkItem[];
  isLoadingProducts: boolean;
  onToggleProducts: (orderId: string) => void;
  onOpenProduct: (url: string) => void;
  onResolveCapacityRequest: (orderId: string, requestId: string, approve: boolean) => void;
};

export function MyOrderCard({
  language,
  order,
  currentUserName,
  onExtend,
  onStatusChange,
  onCostsChange,
  onLocationChange,
  onRate,
  isProductsOpen,
  productLinks,
  isLoadingProducts,
  onToggleProducts,
  onOpenProduct,
  onResolveCapacityRequest,
}: MyOrderCardProps) {
  const t = (key: TranslationKey) => translate(language, key);
  const safeAreaInsets = useSafeAreaInsets();
  const isOrganizer = order.created_by === currentUserName;
  const [ratingScores, setRatingScores] = useState<Record<string, number>>({});
  const [ratingComments, setRatingComments] = useState<Record<string, string>>({});
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<(typeof order.member_details)[number] | null>(null);
  const [isEditingCosts, setIsEditingCosts] = useState(false);
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState(String(order.delivery_fee));
  const [processingFeeDraft, setProcessingFeeDraft] = useState(String(order.processing_fee));
  const [minimumOrderDraft, setMinimumOrderDraft] = useState(order.minimum_order_value === null ? '' : String(order.minimum_order_value));
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ latitude: order.latitude, longitude: order.longitude });
  const canExtend = isOrganizer && order.status === 'expired' && !order.extended_once;
  const canUpdateStatus = isOrganizer && !['delivered', 'cancelled'].includes(order.status);

  return (
    <View style={styles.orderCard}>
      <Text style={styles.orderTitle}>{order.platform}</Text>
      <Text style={styles.orderMeta}>{t('status')}: {statusLabel(order.status, language)}</Text>
      <Text style={styles.orderMeta}>
        {t('participants')}: {order.current_people}/{order.min_people}
      </Text>
      <Pressable onPress={() => setIsDetailsOpen(true)} style={styles.panelToggleButton}>
        <Text style={styles.panelToggleText}>{t('viewOrderDetails')}</Text>
      </Pressable>
      <Modal visible={isDetailsOpen} animationType="slide" onRequestClose={() => setIsDetailsOpen(false)}>
        <ScrollView
          contentContainerStyle={[
            styles.detailsModal,
            { paddingTop: safeAreaInsets.top + 20, paddingBottom: safeAreaInsets.bottom + 24 },
          ]}
        >
          <Text style={styles.orderTitle}>{t('orderDetails')}: {order.platform}</Text>
          <Text style={styles.orderMeta}>{t('status')}: {statusLabel(order.status, language)}</Text>
          <Text style={styles.orderMeta}>{t('participants')}: {order.current_people}/{order.min_people}</Text>
          <Text style={styles.orderMeta}>{t('initiatedBy')}: {order.created_by}</Text>
          <Text style={styles.orderMeta}>{t('interval')}: {order.max_wait_days} {t('days')}</Text>
          <Text style={styles.orderMeta}>{t('timeLeft')}: {timeLeftLabel(order.expires_at, language)}</Text>
          <OrderCosts language={language} order={order} />
          {order.join_state === 'joined' && (
            <View>
              <Text style={styles.reputationLabel}>{t('participantNames')}</Text>
              {(order.member_details ?? []).filter((member) => member.user_name !== order.created_by).map((member) => (
                <Pressable
                  key={member.user_name}
                  onPress={() => setSelectedMember(member)}
                  style={styles.publicRatingBox}
                >
                  <Text style={styles.ratingAverage}>
                    {member.user_name} · ★ {member.rating_summary?.participant_average ?? '—'}/5
                  </Text>
                  <Text style={styles.panelToggleText}>{t('viewProfileAndReviews')}</Text>
                </Pressable>
              ))}
              {(order.member_details ?? []).filter((member) => member.user_name !== order.created_by).length === 0 && (
                <Text style={styles.noRatings}>{t('participantListUnavailable')}</Text>
              )}
            </View>
          )}
          <Pressable onPress={() => setIsDetailsOpen(false)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('close')}</Text>
          </Pressable>
        </ScrollView>
      </Modal>
      <Modal visible={selectedMember !== null} animationType="slide" onRequestClose={() => setSelectedMember(null)}>
        <ScrollView
          contentContainerStyle={[
            styles.detailsModal,
            { paddingTop: safeAreaInsets.top + 20, paddingBottom: safeAreaInsets.bottom + 24 },
          ]}
        >
          <Text style={styles.orderTitle}>{t('participantProfile')}</Text>
          <Text style={styles.ratingUser}>{selectedMember?.user_name}</Text>
          <RatingSummary language={language} summary={selectedMember?.rating_summary ?? null} />
          <Pressable onPress={() => setSelectedMember(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('close')}</Text>
          </Pressable>
        </ScrollView>
      </Modal>
      <Text style={styles.orderMeta}>{t('interval')}: {order.max_wait_days} {t('days')}</Text>
      <Text style={styles.orderMeta}>{t('timeLeft')}: {timeLeftLabel(order.expires_at, language)}</Text>
      <Text style={styles.orderMeta}>{t('extensionUsed')}: {order.extended_once ? t('yes') : t('no')}</Text>
      <OrderCosts language={language} order={order} />
      {isOrganizer && order.current_people === 1 && !['delivered', 'cancelled'].includes(order.status) && (
        <>
          <Pressable onPress={() => setIsLocationPickerOpen(true)} style={styles.panelToggleButton}>
            <Text style={styles.panelToggleText}>{t('editOrderLocation')}</Text>
          </Pressable>
          <OrderLocationPicker
            language={language}
            visible={isLocationPickerOpen}
            value={locationDraft}
            onChange={setLocationDraft}
            onClose={() => setIsLocationPickerOpen(false)}
            onConfirm={() => {
              onLocationChange(order.id, locationDraft.latitude, locationDraft.longitude);
              setIsLocationPickerOpen(false);
            }}
          />
        </>
      )}
      {isOrganizer && !['delivered', 'cancelled'].includes(order.status) && (
        <View>
          <Pressable onPress={() => setIsEditingCosts((value) => !value)} style={styles.panelToggleButton}>
            <Text style={styles.panelToggleText}>{t('editOrderCosts')}</Text>
          </Pressable>
          {isEditingCosts && (
            <View style={styles.panelBody}>
              <Text style={styles.costFieldLabel}>{t('deliveryFee')}</Text>
              <TextInput value={deliveryFeeDraft} onChangeText={setDeliveryFeeDraft} keyboardType="decimal-pad" style={styles.input} placeholder={t('deliveryFee')} placeholderTextColor="#64748b" />
              <Text style={styles.costFieldLabel}>{t('processingFee')}</Text>
              <TextInput value={processingFeeDraft} onChangeText={setProcessingFeeDraft} keyboardType="decimal-pad" style={styles.input} placeholder={t('processingFee')} placeholderTextColor="#64748b" />
              <Text style={styles.costFieldLabel}>{t('minimumOrderValue')}</Text>
              <TextInput value={minimumOrderDraft} onChangeText={setMinimumOrderDraft} keyboardType="decimal-pad" style={styles.input} placeholder={t('minimumOrderValue')} placeholderTextColor="#64748b" />
              <Pressable style={styles.secondaryButton} onPress={() => {
                onCostsChange(order.id, Number(deliveryFeeDraft.replace(',', '.')), Number(processingFeeDraft.replace(',', '.')), minimumOrderDraft.trim() ? Number(minimumOrderDraft.replace(',', '.')) : null);
                setIsEditingCosts(false);
              }}>
                <Text style={styles.secondaryButtonText}>{t('saveCosts')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      <Text style={styles.reputationLabel}>{t('organizerReputation')}</Text>
      <RatingSummary language={language} summary={order.creator_rating_summary} />

      <Pressable onPress={() => onToggleProducts(order.id)} style={styles.panelToggleButton}>
        <Text style={styles.panelToggleText}>
          {isProductsOpen ? t('hideOrderProducts') : t('viewOrderProducts')}
        </Text>
      </Pressable>
      {isProductsOpen && (
        <View style={styles.panelBody}>
          {isLoadingProducts ? (
            <ActivityIndicator color="#84cc16" />
          ) : productLinks.length === 0 ? (
            <Text style={styles.emptyState}>{t('noOrderProducts')}</Text>
          ) : (
            productLinks.map((link) => (
              <Pressable key={link.id} onPress={() => onOpenProduct(link.url)} style={styles.myOrderProductRow}>
                <Text style={styles.myOrderProductUser}>{link.user_name}</Text>
                <Text style={styles.myOrderProductUrl} numberOfLines={2}>{link.url}</Text>
                <Text style={styles.openProductText}>{t('openProduct')}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

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

      {isOrganizer && (order.capacity_requests?.length ?? 0) > 0 && (
        <View style={styles.capacityPanel}>
          <Text style={styles.ratingTitle}>{t('extraSpotRequests')}</Text>
          {(order.capacity_requests ?? []).map((request) => (
            <View key={request.id} style={styles.capacityRequestRow}>
              <Text style={styles.ratingUser}>{request.user_name}</Text>
              <View style={styles.capacityActions}>
                <Pressable
                  onPress={() => onResolveCapacityRequest(order.id, request.id, true)}
                  style={styles.approveCapacityButton}
                >
                  <Text style={styles.smallStatusButtonText}>{t('approve')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onResolveCapacityRequest(order.id, request.id, false)}
                  style={styles.smallDangerButton}
                >
                  <Text style={styles.smallDangerButtonText}>{t('reject')}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {order.status === 'delivered' && (order.rating_candidates?.length ?? 0) > 0 && (
        <View style={styles.ratingPanel}>
          <Text style={styles.ratingTitle}>{t('rateOrderMembers')}</Text>
          {(order.rating_candidates ?? []).map((candidate) => (
            <View key={candidate.user_name} style={styles.ratingRow}>
              <View style={styles.ratingIdentity}>
                <Text style={styles.ratingUser}>{candidate.user_name}</Text>
                <Text style={styles.ratingCategory}>
                  {candidate.category === 'organizer' ? t('organizerRating') : t('participantRating')}
                </Text>
              </View>
              {candidate.score === null ? (
                <View style={styles.ratingForm}>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <Pressable
                        key={score}
                        onPress={() => setRatingScores((previous) => ({ ...previous, [candidate.user_name]: score }))}
                      >
                        <Text style={styles.starButton}>
                          {score <= (ratingScores[candidate.user_name] ?? 0) ? '★' : '☆'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={ratingComments[candidate.user_name] ?? ''}
                    onChangeText={(comment) => setRatingComments((previous) => ({
                      ...previous,
                      [candidate.user_name]: comment,
                    }))}
                    placeholder={t('ratingCommentPlaceholder')}
                    placeholderTextColor="#64748b"
                    style={styles.ratingInput}
                    maxLength={500}
                    multiline
                  />
                  <Pressable
                    style={styles.submitRatingButton}
                    onPress={() => onRate(
                      order.id,
                      candidate.user_name,
                      ratingScores[candidate.user_name] ?? 0,
                      ratingComments[candidate.user_name] ?? '',
                    )}
                  >
                    <Text style={styles.submitRatingText}>{t('submitRating')}</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <Text style={styles.ratingGiven}>{'★'.repeat(candidate.score)} {candidate.score}/5</Text>
                  {candidate.comment && <Text style={styles.ownComment}>“{candidate.comment}”</Text>}
                </View>
              )}
              <RatingSummary language={language} summary={candidate.rating_summary} />
            </View>
          ))}
          <Text style={styles.ratingNote}>{t('ratingFinalNote')}</Text>
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
  onRequestExtraSpot: (orderId: string) => void;
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
  onRequestExtraSpot,
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
  const canRequestExtraSpot =
    order.status === 'open' && !isOwnOrder && !isJoined && isOrderFull &&
    order.min_people < 10 && order.my_capacity_request_status !== 'pending';
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
      <RatingSummary language={language} summary={order.creator_rating_summary} />
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
        onPress={() => (canJoin ? onJoin(order.id) : onRequestExtraSpot(order.id))}
        style={[styles.secondaryButton, !canJoin && !canRequestExtraSpot && styles.disabledButton]}
        disabled={!canJoin && !canRequestExtraSpot}
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
                  : order.my_capacity_request_status === 'pending'
                  ? t('extraSpotRequestPending')
                  : isOrderFull && order.min_people < 10
                  ? t('requestExtraSpot')
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
  detailsModal: {
    flexGrow: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    gap: 10,
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
  sharedCostText: {
    color: '#d9f99d',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  costFieldLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 2,
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
  ratingPanel: {
    marginTop: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8,
  },
  ratingTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
  },
  ratingRow: {
    alignItems: 'stretch',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 9,
    padding: 8,
  },
  ratingIdentity: {
    flex: 1,
  },
  ratingUser: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  ratingCategory: {
    color: '#94a3b8',
    fontSize: 10,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  starButton: {
    color: '#facc15',
    fontSize: 25,
    lineHeight: 28,
  },
  ratingGiven: {
    color: '#facc15',
    fontSize: 12,
    fontWeight: '800',
  },
  ratingNote: {
    color: '#64748b',
    fontSize: 10,
  },
  reputationLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  publicRatingBox: {
    gap: 2,
    marginTop: 2,
  },
  ratingAverage: {
    color: '#facc15',
    fontSize: 11,
    fontWeight: '700',
  },
  publicComment: {
    color: '#cbd5e1',
    fontSize: 10,
    fontStyle: 'italic',
  },
  noRatings: {
    color: '#64748b',
    fontSize: 10,
  },
  ratingForm: {
    width: '100%',
    gap: 5,
  },
  ratingInput: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    color: '#f8fafc',
    minHeight: 48,
    fontSize: 11,
  },
  submitRatingButton: {
    alignSelf: 'flex-end',
    borderRadius: 8,
    backgroundColor: '#84cc16',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  submitRatingText: {
    color: '#132b02',
    fontSize: 11,
    fontWeight: '800',
  },
  ownComment: {
    color: '#cbd5e1',
    fontSize: 10,
    fontStyle: 'italic',
  },
  capacityPanel: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    gap: 7,
  },
  capacityRequestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  capacityActions: {
    flexDirection: 'row',
    gap: 6,
  },
  approveCapacityButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#84cc16',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  myOrderProductRow: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 9,
    padding: 8,
    backgroundColor: '#111827',
    gap: 2,
  },
  myOrderProductUser: {
    color: '#d9f99d',
    fontSize: 11,
    fontWeight: '800',
  },
  myOrderProductUrl: {
    color: '#93c5fd',
    fontSize: 11,
  },
  openProductText: {
    color: '#84cc16',
    fontSize: 10,
    fontWeight: '700',
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
