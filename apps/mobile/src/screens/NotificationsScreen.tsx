// apps/mobile/src/screens/NotificationsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';

type NotificationData = {
  orderId?: string;
  order_id?: string;
  order?: {
    id?: string;
    chatThreadId?: string;
    chat_thread_id?: string;
    customer?: { name?: string; avatarUrl?: string };
    specialist?: { name?: string; avatarUrl?: string };
  };

  threadId?: string;
  thread_id?: string;
  chatThreadId?: string;
  chat_thread_id?: string;
  customerName?: string;
  customer_name?: string;
  specialistName?: string;
  specialist_name?: string;
  customer?: { name?: string; avatarUrl?: string };
  specialist?: { name?: string; avatarUrl?: string };

  [k: string]: any;
};

type NotificationItem = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { token, ready } = useAuth();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  // ✅ Mantener badge del SO sincronizado con no leídas
  useEffect(() => {
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  const loadNotifications = useCallback(async () => {
    if (!ready || !token) {
      if (__DEV__) console.log('[Notifications] skip load: auth not ready');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data } = await api.get('/notifications', {
        params: { limit: 50 },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const list: NotificationItem[] = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
    } catch (e: any) {
      const status = e?.response?.status;
      console.log('[Notifications] error', status, e?.message);
      if (status === 401) setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ready, token]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!ready || !token) return;
      try {
        await api.patch(`/notifications/${id}/read`, null, {
          headers: { 'Cache-Control': 'no-cache' },
        });
      } catch (e: any) {
        if (__DEV__) {
          console.log('[Notifications] markAsRead error', e?.response?.status, e?.message);
        }
      }
    },
    [ready, token],
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handlePress = async (item: NotificationItem) => {
    // ✅ 0) Optimista: sacamos el punto amarillo ya
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      // ✅ persistimos en backend (sin frenar navegación)
      markAsRead(item.id);
    }

    const parent = navigation.getParent?.();
    const data = item?.data ?? {};
    const type = (item?.type ?? '').toString();
    const title = item?.title ?? '';
    const body = item?.body ?? '';

    // ✅ Antecedentes → Perfil > BackgroundCheck
    if (type === 'BACKGROUND_CHECK_STATUS' || type === 'BACKGROUND_CHECK_REVIEW_REQUEST') {
      if (parent?.navigate) {
        parent.navigate('Perfil', { screen: 'BackgroundCheck' });
      } else {
        navigation.navigate('Perfil', { screen: 'BackgroundCheck' });
      }
      return;
    }

    // Extraemos posibles IDs
    const orderId: string | null = data.orderId ?? data.order_id ?? data.order?.id ?? null;

    let threadId: string | null =
      data.threadId ??
      data.thread_id ??
      data.chatThreadId ??
      data.chat_thread_id ??
      data.thread?.id ??
      data.chat?.threadId ??
      data.order?.chatThreadId ??
      data.order?.chat_thread_id ??
      null;

    // Nombres que puedan venir directo en el payload
    let customerName: string | null =
      data.customerName ??
      data.customer_name ??
      data.customer?.name ??
      data.order?.customer?.name ??
      null;

    let specialistName: string | null =
      data.specialistName ??
      data.specialist_name ??
      data.specialist?.name ??
      data.order?.specialist?.name ??
      null;

    // 🔍 ¿Es "mensaje recibido"? -> miramos título / body / type
    const looksLikeMessage =
      /mensaje/i.test(title) ||
      /mensaje/i.test(body) ||
      /chat/i.test(type) ||
      /message/i.test(type);

    if (__DEV__) {
      console.log('────────────────────────');
      console.log('[Notifications] item.id =', item.id);
      console.log('[Notifications] type =', type);
      console.log('[Notifications] title =', title);
      console.log('[Notifications] body =', body);
      console.log('[Notifications] data =', JSON.stringify(data, null, 2));
      console.log('[Notifications] initial orderId =', orderId);
      console.log('[Notifications] initial threadId =', threadId);
      console.log('[Notifications] looksLikeMessage =', looksLikeMessage);
    }

    // Si la notificación parece de MENSAJE y tenemos orderId,
    // llamamos a /orders/:id para sacar chatThreadId + nombres si faltan
    if (looksLikeMessage && orderId) {
      try {
        const r = await api.get(`/orders/${orderId}`, {
          headers: { 'Cache-Control': 'no-cache' },
        });
        const o = (r.data as any)?.order ?? r.data;

        if (__DEV__) {
          console.log('[Notifications] /orders response =', JSON.stringify(o, null, 2));
        }

        if (o) {
          if (!threadId && o.chatThreadId) threadId = o.chatThreadId;
          customerName = customerName ?? o.customer?.name ?? null;
          specialistName = specialistName ?? o.specialist?.name ?? null;
        }
      } catch (e) {
        console.log('[Notifications] error fetching order for chat', e);
      }
    }

    const counterpartName = customerName || specialistName || null;
    const chatTitle = counterpartName || 'Chat';

    if (__DEV__) {
      console.log('[Notifications] final orderId =', orderId);
      console.log('[Notifications] final threadId =', threadId);
      console.log('[Notifications] counterpartName =', counterpartName);
      console.log('[Notifications] chatTitle =', chatTitle);
    }

    // 👉 Caso 1: notificación de MENSAJE con threadId → ir DIRECTO al chat
    if (looksLikeMessage && threadId) {
      if (__DEV__) console.log('[Notifications] NAV → ChatThread (direct from list)');

      const params: any = { threadId: String(threadId), title: chatTitle };
      if (orderId) params.orderId = String(orderId);

      if (parent?.navigate) {
        parent.navigate('Chat', { screen: 'ChatThread', params });
      } else {
        navigation.navigate('Chat', { screen: 'ChatThread', params });
      }
      return;
    }

    // 👉 Caso 2: cualquier otra notificación → OrderDetail
    if (!orderId) {
      if (__DEV__) console.log('[Notifications] no orderId, no navigation');
      return;
    }

    if (__DEV__) console.log('[Notifications] NAV → OrderDetail (from list)');

    const refreshAt = Date.now();

    // ✅ NO pasamos role (lo resuelve Auth/Stack)
    if (parent?.navigate) {
      parent.navigate('Agenda', {
        screen: 'OrderDetail',
        params: { id: String(orderId), from: 'notifications', refreshAt },
      });
      return;
    }

    navigation.navigate('Agenda', {
      screen: 'OrderDetail',
      params: { id: String(orderId), from: 'notifications', refreshAt },
    });
  };

  function renderItem({ item }: { item: NotificationItem }) {
    const isRead = !!item.readAt;
    return (
      <Pressable onPress={() => handlePress(item)} style={[styles.item, isRead && styles.itemRead]}>
        <View style={styles.itemIcon}>
          <Ionicons
            name={isRead ? 'notifications-outline' : 'notifications'}
            size={22}
            color={isRead ? '#7FA2A8' : '#E9FEFF'}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {item.title || 'Notificación'}
          </Text>

          {item.body ? (
            <Text style={styles.itemBody} numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}

          <Text style={styles.itemMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>

        {!isRead && <View style={styles.unreadDot} />}
      </Pressable>
    );
  }

  if (loading && !refreshing) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#E9FEFF" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <Ionicons
            name="chevron-back"
            size={26}
            color="#E9FEFF"
            onPress={() => navigation.goBack()}
          />
          <Text style={styles.headerTitle}>Notificaciones</Text>
          <View style={{ width: 26 }} />
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            items.length === 0 ? styles.emptyContainer : styles.listContent,
            { paddingBottom: tabBarHeight + 24 },
          ]}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Todavía no tenés notificaciones.</Text>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E9FEFF" />
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#E9FEFF', fontSize: 18, fontWeight: '800' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(233,254,255,0.18)',
    gap: 10,
  },
  itemRead: { opacity: 0.7 },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,35,40,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { color: '#E9FEFF', fontWeight: '700', marginBottom: 2 },
  itemBody: { color: '#C2E7EB', fontSize: 13 },
  itemMeta: { color: '#7FA2A8', fontSize: 11, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFE066',
    marginLeft: 6,
    marginTop: 4,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: { color: '#C2E7EB', textAlign: 'center', fontSize: 14 },
});
