export type Tab = 'home' | 'create' | 'nearby';
export type Coordinate = { latitude: number; longitude: number };
export type ApiStatus = 'checking' | 'online' | 'offline';
export type AuthMode = 'login' | 'register';
export type AuthProvider = 'email' | 'google';

export type User = {
  id: string;
  email: string;
  display_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type OrderStatus =
  | 'open'
  | 'expired'
  | 'closed'
  | 'ready_to_order'
  | 'ordered'
  | 'delivered'
  | 'cancelled';

export type OrderItem = {
  id: string;
  platform: string;
  min_people: number;
  current_people: number;
  created_by: string;
  max_wait_days: number;
  expires_at: string;
  status: OrderStatus;
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

export type ProductLinkItem = {
  id: string;
  order_id: string;
  user_name: string;
  url: string;
  processed: boolean;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
};

export type ProductLinksResponse = {
  items: ProductLinkItem[];
  slots_used: number;
  slots_max: number;
};

export type OrderMessageItem = {
  id: string;
  order_id: string;
  user_name: string;
  message: string;
  created_at: string;
};

export type OrderMessagesResponse = {
  items: OrderMessageItem[];
};

export type NotificationItem = {
  id: string;
  event_type: string;
  title: string;
  message: string;
  related_order_id: string | null;
  created_at: string;
  read: boolean;
};

export type NotificationsResponse = {
  items: NotificationItem[];
  unread_count: number;
};
