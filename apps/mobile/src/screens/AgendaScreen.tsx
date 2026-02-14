// apps/mobile/src/screens/AgendaScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import relativeTime from 'dayjs/plugin/relativeTime';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { useOrdersList } from '../hooks/useOrders';

import type { AgendaSection } from '../types';

dayjs.locale('es');
dayjs.extend(relativeTime);

type TabKey = 'pending' | 'confirmed' | 'review' | 'finished' | 'cancelled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'confirmed', label: 'Confirmados' },
  { key: 'review', label: 'Revisión' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'cancelled', label: 'Cancelados' },
];

// ✅ Mapea estados backend → tabs UI (solo para default navigation)
function mapSectionToTab(section?: string): TabKey {
  switch (section) {
    case 'PENDING':
      return 'pending';

    case 'ASSIGNED':
    case 'IN_PROGRESS':
    case 'PAUSED':
      return 'confirmed';

    case 'IN_CLIENT_REVIEW':
    case 'FINISHED_BY_SPECIALIST':
      return 'review';

    case 'CONFIRMED_BY_CLIENT':
    case 'CLOSED':
      return 'finished';

    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_SPECIALIST':
    case 'CANCELLED_AUTO':
      return 'cancelled';

    default:
      return 'pending';
  }
}

// ✅ Lista dura de estados permitidos por tab (blindaje contra mezclas/cache)
const TAB_ALLOWED_STATUSES: Record<TabKey, string[]> = {
  pending: ['PENDING'],

  // ✅ Confirmados = en curso
  confirmed: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'],

  // ✅ Revisión = falta confirmación del cliente
  review: ['IN_CLIENT_REVIEW', 'FINISHED_BY_SPECIALIST'],

  // ✅ Finalizados = cliente confirmó o ya cerró
  finished: ['CONFIRMED_BY_CLIENT', 'CLOSED'],

  cancelled: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SPECIALIST', 'CANCELLED_AUTO'],
};

export default function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  // ✅ role REAL para API (NO depende de mode)
  const role: 'customer' | 'specialist' = user?.role === 'SPECIALIST' ? 'specialist' : 'customer';

  const incomingSection = route.params?.initialSection as AgendaSection | undefined;
  const needsRefresh = route.params?.refresh as boolean | undefined;

  const [tab, setTab] = useState<TabKey>(
    incomingSection ? mapSectionToTab(incomingSection) : 'pending',
  );

  // ✅ hint suave para indicar scroll de tabs (solo 1 vez al entrar)
  const [showTabsHint, setShowTabsHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowTabsHint(false), 2600);
    return () => clearTimeout(t);
  }, []);

  // ✅ closed solo para Finalizados y Cancelados
  const isClosed = tab === 'finished' || tab === 'cancelled';

  const { data, isLoading, isFetching, refetch } = useOrdersList(
    { role, status: isClosed ? 'closed' : 'open' },
    tab,
  );

  const list = useMemo(() => data ?? [], [data]);

  // ✅ Filtro duro por whitelist
  const filteredList = useMemo(() => {
    const allowed = TAB_ALLOWED_STATUSES[tab];
    return list.filter((o: any) => {
      const s = String(o.status ?? '')
        .trim()
        .toUpperCase();
      return allowed.includes(s);
    });
  }, [list, tab]);

  // ✅ si nos mandan section nuevo, cambiamos al tab correcto
  useEffect(() => {
    if (incomingSection) {
      const mapped = mapSectionToTab(incomingSection);
      if (mapped !== tab) setTab(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingSection]);

  // ✅ refetch al cambiar de tab (mata cache rara)
  useEffect(() => {
    refetch();
  }, [tab, refetch]);

  // ✅ si vuelvo de OrderDetail con refresh
  useEffect(() => {
    if (needsRefresh) refetch();
  }, [needsRefresh, refetch]);

  const getCounterpartName = (item: any) => {
    if (role === 'specialist') return item.customer?.name ?? null;
    return item.specialist?.name ?? null;
  };

  const getRubroText = (item: any) => {
    // 1) si el hook ya lo trae directo
    const direct = item.categoryName || item.rubro || item.serviceCategoryName;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    // 2) si viene dentro de service
    const fromService =
      item.service?.categoryName ||
      item.service?.category?.name ||
      item.service?.category?.title ||
      item.service?.categoryLabel;

    if (typeof fromService === 'string' && fromService.trim()) return fromService.trim();

    // 3) último fallback
    return item.service?.name ?? 'Sin rubro';
  };

  const getWhenText = (item: any) => {
    // 1) agendado
    if (item.scheduledAt) return `Agendado: ${dayjs(item.scheduledAt).format('DD MMM, HH:mm')}`;

    // 2) urgente
    if (item.isUrgent) return 'Urgente';

    // 3) preferencia
    if (item.preferredAt) return `Preferencia: ${dayjs(item.preferredAt).format('DD MMM, HH:mm')}`;

    return 'Sin fecha definida';
  };

  const getCreatedAgo = (item: any) => {
    if (!item.createdAt) return null;
    return dayjs(item.createdAt).fromNow();
  };

  return (
    <LinearGradient colors={['#004d5d', '#003a47']} style={{ flex: 1 }}>
      {/* Header tabs */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}>
        <View style={{ position: 'relative' }}>
          {/* Fade izquierda */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,77,93,1)', 'rgba(0,77,93,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 18,
              zIndex: 2,
            }}
          />

          {/* Fade derecha */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,77,93,0)', 'rgba(0,77,93,1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 34,
              zIndex: 2,
            }}
          />

          {/* Hint flecha derecha */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 6,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              zIndex: 3,
              opacity: 0.85,
            }}
          >
            <Ionicons name="chevron-forward" size={18} color="#E9FEFF" />
          </View>

          <FlatList
            data={TABS}
            keyExtractor={(i) => i.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 12,
              gap: 8,
              paddingRight: 42, // ✅ deja lugar para que no quede tapado por el fade + flecha
            }}
            renderItem={({ item }) => {
              const active = item.key === tab;
              return (
                <Pressable
                  onPress={() => setTab(item.key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 18,
                    backgroundColor: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
                  }}
                >
                  <Text
                    style={{
                      color: active ? '#064e5b' : '#e8f5f7',
                      fontWeight: active ? '700' : '500',
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>

        {showTabsHint && (
          <Text
            style={{
              color: 'rgba(233,254,255,0.8)',
              fontSize: 12,
              marginTop: 6,
              marginLeft: 12,
            }}
          >
            Deslizá para ver más estados →
          </Text>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: 12 }}>
        {(isLoading || isFetching) && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        )}

        {!isLoading && !isFetching && filteredList.length === 0 && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'white', opacity: 0.9, fontWeight: '600' }}>
              No hay órdenes en esta sección
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{
                marginTop: 10,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Recargar</Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !isFetching && filteredList.length > 0 && (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
            renderItem={({ item }) => {
              const counterpartName = getCounterpartName(item);
              const title = counterpartName ?? item.service?.name ?? 'Orden';
              const rubro = getRubroText(item);

              const createdAgo = getCreatedAgo(item);
              const whenText = getWhenText(item);

              // Línea final: "hace X • Agendado: ..."
              const footerLine = createdAgo ? `${createdAgo} • ${whenText}` : whenText;

              return (
                <Pressable
                  onPress={() =>
                    navigation.navigate('OrderDetail', {
                      id: item.id,
                      role,
                      from: 'agenda',
                    })
                  }
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  {/* 1) Nombre contraparte */}
                  <Text style={{ color: '#0b3d45', fontWeight: '700', marginBottom: 4 }}>
                    {title}
                  </Text>

                  {/* 2) Rubro */}
                  <Text style={{ color: '#0b3d45', opacity: 0.8 }}>{rubro}</Text>

                  <View style={{ height: 6 }} />

                  {/* 3) Hace cuánto + Agendado/Urgente */}
                  <Text style={{ color: '#0b3d45', opacity: 0.7 }}>{footerLine}</Text>
                </Pressable>
              );
            }}
            onRefresh={refetch}
            refreshing={isFetching}
          />
        )}
      </View>
    </LinearGradient>
  );
}
