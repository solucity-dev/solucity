// apps/mobile/src/screens/OrdersScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../lib/api';
import type { HomeStackParamList } from '../types';

type RouteT = RouteProp<HomeStackParamList, 'Orders'>;

type Role = 'customer' | 'specialist';

type OrderListItem = {
  id: string;
  status: string;
  createdAt: string;
  preferredAt: string | null;
  scheduledAt: string | null;
  isUrgent: boolean;
  acceptDeadlineAt: string | null;
  service?: { name?: string | null } | null;
  location?: { formatted?: string | null } | null;
  meta?: { deadline?: 'none' | 'active' | 'expired'; timeLeftMs?: number | null } | null;
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteT>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const role: Role = (params?.role as Role) || 'customer';
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [deadline, setDeadline] = useState<'all' | 'active' | 'expired'>('all');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<OrderListItem[]>([]);

  const fetchList = async () => {
    try {
      setLoading(true);
      setError(null);

      const qs: Record<string, string> = { role };
      if (status) qs.status = status;
      if (deadline !== 'all') qs.deadline = deadline;

      const r = await api.get('/orders/mine', {
        params: qs,
        headers: { 'Cache-Control': 'no-cache' },
      });

      // Tolerar distintas formas: { list }, { items }, { orders } o array directo
      const payload = r.data;
      const incoming: OrderListItem[] = Array.isArray(payload)
        ? payload
        : (payload?.list ?? payload?.items ?? payload?.orders ?? []);

      console.log('[OrdersScreen] fetched:', {
        count: Array.isArray(incoming) ? incoming.length : '??',
        sample: incoming?.[0],
      });

      setList(incoming || []);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Error al cargar pedidos';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status, deadline]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchList();
    } finally {
      setRefreshing(false);
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PENDING: 'Pendiente',
      ASSIGNED: 'Asignada',
      IN_PROGRESS: 'En curso',
      IN_CLIENT_REVIEW: 'En revisión',
      CONFIRMED_BY_CLIENT: 'Confirmada',
      REJECTED_BY_CLIENT: 'Rechazada',
      CANCELLED_BY_CUSTOMER: 'Cancelada (cliente)',
      CANCELLED_BY_SPECIALIST: 'Cancelada (especialista)',
      CANCELLED_AUTO: 'Cancelada (auto)',
      CLOSED: 'Cerrada',
    };
    return map[s] ?? s;
  };

  const fmtDateTime = (iso?: string | null) =>
    !iso ? '—' : new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

  const badgeDeadline = (m?: OrderListItem['meta']) => {
    const d = m?.deadline;
    if (!d || d === 'none') return { text: 'Sin límite', style: styles.badgeSoft };
    if (d === 'active') return { text: 'A tiempo', style: styles.badgeOk };
    return { text: 'Vencido', style: styles.badgeWarn };
  };

  const headerTitle = useMemo(
    () => (role === 'customer' ? 'Mis pedidos' : 'Pedidos recibidos'),
    [role],
  );

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => nav.goBack()} style={{ padding: 6, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.brand}>{headerTitle}</Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Filtros */}
        <View style={styles.filters}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {[
              { key: undefined, label: 'Todos' },
              { key: 'PENDING', label: 'Pendientes' },
              { key: 'ASSIGNED', label: 'Asignadas' },
              { key: 'IN_PROGRESS', label: 'En curso' },
              { key: 'IN_CLIENT_REVIEW', label: 'En revisión' },
              { key: 'CLOSED', label: 'Cerradas' },
            ].map((f) => {
              const on = status === f.key;
              return (
                <Pressable
                  key={String(f.key)}
                  onPress={() => setStatus(f.key)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
            <View style={{ width: 12 }} />
            {(['all', 'active', 'expired'] as const).map((d) => {
              const on = deadline === d;
              const label =
                d === 'all' ? 'Límites: Todos' : d === 'active' ? 'A tiempo' : 'Vencidos';
              return (
                <Pressable
                  key={d}
                  onPress={() => setDeadline(d)}
                  style={[styles.chipAlt, on && styles.chipAltOn]}
                >
                  <Text style={[styles.chipTextAlt, on && styles.chipTextAltOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Contenido */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E9FEFF" />
            <Text style={{ color: '#E9FEFF', marginTop: 8 }}>Cargando pedidos…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: '#FFECEC', fontWeight: '800' }}>Error</Text>
            <Text style={{ color: '#FFECEC', marginTop: 6 }}>{error}</Text>
            <Pressable onPress={fetchList} style={styles.retryBtn}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.center}>
            <MDI name="clipboard-text-outline" size={40} color="#E9FEFF" />
            <Text style={{ color: '#E9FEFF', marginTop: 10, fontWeight: '800' }}>Sin pedidos</Text>
            <Text style={{ color: 'rgba(233,254,255,0.9)', marginTop: 4 }}>
              {role === 'customer'
                ? 'Cuando crees un pedido aparecerá aquí.'
                : 'A la espera de nuevas solicitudes.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
          >
            {list.map((o) => {
              const dl = badgeDeadline(o.meta);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => nav.navigate('OrderDetail', { id: o.id })}
                  style={styles.card}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={styles.cardTitle}>{o.service?.name ?? 'Servicio'}</Text>
                    <View style={[styles.badge, dl.style]}>
                      <Text style={styles.badgeText}>{dl.text}</Text>
                    </View>
                  </View>

                  <View style={styles.row}>
                    <Ionicons name="time-outline" size={16} color="#E9FEFF" />
                    <Text style={styles.muted}>Creada: {fmtDateTime(o.createdAt)}</Text>
                  </View>

                  <View style={styles.row}>
                    <Ionicons name="calendar-outline" size={16} color="#E9FEFF" />
                    <Text style={styles.muted}>Programada: {fmtDateTime(o.scheduledAt)}</Text>
                  </View>

                  <View style={styles.row}>
                    <Ionicons
                      name="flash-outline"
                      size={16}
                      color={o.isUrgent ? '#ffe164' : '#E9FEFF'}
                    />
                    <Text style={styles.muted}>{o.isUrgent ? 'Urgente' : 'Normal'}</Text>
                  </View>

                  <View style={styles.row}>
                    <Ionicons name="location-outline" size={16} color="#E9FEFF" />
                    <Text numberOfLines={1} style={styles.muted}>
                      {o.location?.formatted ?? '—'}
                    </Text>
                  </View>

                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.status}>{statusLabel(o.status)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#E9FEFF', fontWeight: '800', fontSize: 18 },

  filters: { paddingVertical: 8, paddingHorizontal: 14 },

  chip: {
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.65)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: '#E9FEFF' },
  chipText: { color: '#E9FEFF', fontWeight: '800' },
  chipTextOn: { color: '#06494F' },

  chipAlt: {
    borderWidth: 1,
    borderColor: 'rgba(255, 225, 100, 0.65)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipAltOn: { backgroundColor: 'rgba(255, 225, 100, 1)' },
  chipTextAlt: { color: 'rgba(255, 225, 100, 1)', fontWeight: '800' },
  chipTextAltOn: { color: '#06494F' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  retryBtn: {
    marginTop: 10,
    backgroundColor: '#E9FEFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryText: { color: '#06494F', fontWeight: '800' },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: '#E9FEFF', fontSize: 16, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  muted: { color: 'rgba(233,254,255,0.95)', flexShrink: 1 },

  status: { color: '#ffe164', fontWeight: '900' },

  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  badgeOk: { backgroundColor: 'rgba(46, 204, 113, 0.9)' },
  badgeWarn: { backgroundColor: 'rgba(231, 76, 60, 0.9)' },
  badgeSoft: { backgroundColor: 'rgba(233,254,255,0.28)' },
});
