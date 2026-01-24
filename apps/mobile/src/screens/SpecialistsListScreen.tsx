// apps/mobile/src/screens/SpecialistsListScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, api } from '../lib/api';
import { resolveUploadUrl } from '../lib/resolveUploadUrl';

import type { HomeStackParamList } from '../types';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// ===== Tipos =====
type SpecialistsRoute = RouteProp<HomeStackParamList, 'SpecialistsList'>;

type SpecialistRow = {
  specialistId: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  ratingAvg: number | null;
  ratingCount: number | null;

  // ⚠️ dejamos el tipo por compatibilidad, pero lo ocultamos en UI por ahora
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;

  visitPrice?: number | null;

  // etiqueta forma de cobro
  pricingLabel?: string | null;

  availableNow: boolean;
  verified: boolean;
  distanceKm: number;
  name?: string;
  avatarUrl?: string | null;
  enabled?: boolean;
  kycStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
};

type SortBy = 'distance' | 'rating' | 'price';

// ===== Config =====
const RADIUS_KM_DEFAULT = 30;

// Cache en memoria (categoría + coords redondeadas + flags) -> resultados
const resultsCache = new Map<string, { at: number; items: SpecialistRow[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// umbral movimiento
const MOVED_THRESHOLD_KM = 0.2; // 200m

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function errToMsg(e: any) {
  // axios network
  const code = e?.code;
  if (code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor.';
  if (code === 'ECONNABORTED') return 'La solicitud tardó demasiado. Reintentá.';
  const status = e?.response?.status;
  if (status) return `Error del servidor (HTTP ${status}).`;
  return e?.message ?? 'Error desconocido';
}

export default function SpecialistsListScreen() {
  const { params } = useRoute<SpecialistsRoute>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const dbCategorySlug = params.categorySlug;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SpecialistRow[]>([]);

  // Filtros que impactan en backend
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  // ✅ ya NO usamos onlyAvailable: siempre filtramos disponibles
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined);

  // Orden local
  const [sortBy, setSortBy] = useState<SortBy>('distance');

  // Últimas coords conocidas
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);

  // para saber si estamos consultando “lo mismo”
  const lastKeyRef = useRef<string | null>(null);

  /**
   * Pide permiso solo si hace falta, devuelve coords.
   * Si forceFresh=false y no se movió, reutiliza coords previas.
   */
  const getCoordsSmart = useCallback(async (forceFresh: boolean) => {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') throw new Error('Permiso de ubicación denegado');
    }

    if (!lastCoords.current) {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      lastCoords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      return { coords: lastCoords.current, movedKm: Infinity };
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const movedKm = haversineKm(lastCoords.current, fresh);

    if (!forceFresh && movedKm < MOVED_THRESHOLD_KM) {
      return { coords: lastCoords.current, movedKm };
    }

    lastCoords.current = fresh;
    return { coords: fresh, movedKm };
  }, []);

  const buildCacheKey = useCallback(
    (lat: number, lng: number) => {
      const latKey = lat.toFixed(2);
      const lngKey = lng.toFixed(2);

      return [
        dbCategorySlug,
        latKey,
        lngKey,
        RADIUS_KM_DEFAULT,
        onlyEnabled ? 'E1' : 'E0',
        'A1', // ✅ SIEMPRE disponibles
        priceMax ?? 'Px',
      ].join('|');
    },
    [dbCategorySlug, onlyEnabled, priceMax],
  );

  const fetchData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const { coords, movedKm } = await getCoordsSmart(isRefresh);

        const lat = coords.lat;
        const lng = coords.lng;

        const key = buildCacheKey(lat, lng);

        const hit = resultsCache.get(key);
        const cacheFresh = hit && Date.now() - hit.at < CACHE_TTL_MS;

        // 1) si no es refresh, no se movió, misma key, cache fresco -> no backend
        if (
          !isRefresh &&
          movedKm < MOVED_THRESHOLD_KM &&
          lastKeyRef.current === key &&
          cacheFresh
        ) {
          setItems(hit!.items);
          return;
        }

        // 2) si hay cache fresco -> usarlo
        if (cacheFresh) {
          setItems(hit!.items);
          lastKeyRef.current = key;
          return;
        }

        // 3) backend (USANDO api.ts ✅)
        const paramsQ: Record<string, any> = {
          category: dbCategorySlug,
          lat,
          lng,
          radiusKm: RADIUS_KM_DEFAULT,
        };

        if (onlyEnabled) paramsQ.enabled = true;

        // ✅ SIEMPRE filtrar por disponibilidad actual
        paramsQ.availableNow = true;

        if (priceMax != null) paramsQ.priceMax = priceMax;

        if (__DEV__) {
          console.log('[SPECIALISTS][REQ]', {
            baseURL: API_URL,
            path: '/specialists/search',
            params: paramsQ,
          });
        }

        const res = await api.get<SpecialistRow[]>('/specialists/search', { params: paramsQ });

        if (__DEV__) {
          console.log('[SPECIALISTS][RES][0]', {
            categorySent: dbCategorySlug,
            first: res.data?.[0],
          });
        }
        setItems(res.data ?? []);
        resultsCache.set(key, { at: Date.now(), items: res.data ?? [] });
        lastKeyRef.current = key;
      } catch (e: any) {
        if (__DEV__) console.log('[SPECIALISTS][ERR]', e?.code, e?.response?.status, e?.message);
        setError(errToMsg(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildCacheKey, dbCategorySlug, getCoordsSmart, onlyEnabled, priceMax],
  );

  // ✅ Refetch cuando la app vuelve al frente (background -> active)
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          // availability puede cambiar -> no queremos cache viejo
          resultsCache.clear();
          lastKeyRef.current = null;
          fetchData(true);
        }
      });

      return () => sub.remove();
    }, [fetchData]),
  );

  // ✅ Refetch cuando volvés a esta pantalla (por ejemplo desde el perfil)
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        try {
          await getCoordsSmart(false);
          if (!alive) return;

          // availability y flags pueden haber cambiado
          resultsCache.clear();
          lastKeyRef.current = null;

          await fetchData(true);
        } catch (e: any) {
          if (!alive) return;
          setError(errToMsg(e));
          setLoading(false);
          setRefreshing(false);
        }
      })();

      return () => {
        alive = false;
      };
    }, [fetchData, getCoordsSmart]),
  );

  const list = useMemo(() => {
    // ✅ blindaje extra: aunque el backend falle, nunca mostramos no disponibles
    const arr = items.filter((x) => x.availableNow).slice();

    switch (sortBy) {
      case 'distance':
        arr.sort((a, b) => a.distanceKm - b.distanceKm);
        break;
      case 'rating':
        arr.sort(
          (a, b) =>
            (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
        );
        break;
      case 'price':
        arr.sort((a, b) => (a.visitPrice ?? Infinity) - (b.visitPrice ?? Infinity));
        break;
    }
    return arr;
  }, [items, sortBy]);

  const distanceLabel = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
  };

  const priceText = (visitPrice?: number | null) => {
    if (visitPrice == null) return '—';
    return `$${visitPrice.toLocaleString('es-AR')}`;
  };

  // ✅ Regla: si NO hay precio -> no mostramos pill
  // ✅ Si hay precio y no hay label -> "Tarifa" (en vez de "Visita")
  const pricePillLabel = (s: SpecialistRow) => {
    const label = (s.pricingLabel ?? '').trim();
    return label.length ? label : 'Tarifa';
  };

  const FiltersBar = () => (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={styles.filtersRow}>
        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            sortBy === 'distance' && styles.filterChipOn,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => setSortBy('distance')}
        >
          <MDI name="radar" size={16} color={sortBy === 'distance' ? '#06494F' : '#E9FEFF'} />
          <Text style={[styles.filterText, sortBy === 'distance' && styles.filterTextOn]}>
            Cercanía
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            sortBy === 'rating' && styles.filterChipOn,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => setSortBy('rating')}
        >
          <Ionicons
            name="star-outline"
            size={16}
            color={sortBy === 'rating' ? '#06494F' : '#E9FEFF'}
          />
          <Text style={[styles.filterText, sortBy === 'rating' && styles.filterTextOn]}>
            Calificación
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            sortBy === 'price' && styles.filterChipOn,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => setSortBy('price')}
        >
          <MDI name="currency-usd" size={16} color={sortBy === 'price' ? '#06494F' : '#E9FEFF'} />
          <Text style={[styles.filterText, sortBy === 'price' && styles.filterTextOn]}>Precio</Text>
        </Pressable>
      </View>

      <View style={[styles.filtersRow, { marginTop: 8 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            onlyEnabled && styles.filterChipOn,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => setOnlyEnabled((v) => !v)}
        >
          <MDI
            name="badge-account-horizontal-outline"
            size={16}
            color={onlyEnabled ? '#06494F' : '#E9FEFF'}
          />
          <Text style={[styles.filterText, onlyEnabled && styles.filterTextOn]}>Habilitados</Text>
        </Pressable>

        {/* ✅ “Disponibles” oculto: ahora siempre filtramos disponibles */}
        <View style={[styles.filterChip, styles.filterChipOn, { opacity: 0.8 }]}>
          <MDI name="clock-outline" size={16} color="#06494F" />
          <Text style={[styles.filterText, styles.filterTextOn]}>Disponibles</Text>
        </View>

        {/* NOTA: priceMax está en estado, pero no hay UI aún en tu código. */}
      </View>
    </View>
  );

  const SpecialistCard = ({ s }: { s: SpecialistRow }) => {
    const online = s.availableNow;

    const avatarUrl = resolveUploadUrl(s.avatarUrl);
    const avatarSource = avatarUrl
      ? { uri: avatarUrl }
      : require('../assets/avatar-placeholder.png');

    if (__DEV__) {
      console.log('[AVATAR][LIST]', {
        API_URL,
        name: s.name,
        avatarUrl: s.avatarUrl,
        resolved: avatarUrl ?? null,
      });
    }

    const isEnabled = s.enabled; // puede ser true/false/undefined

    const showPricePill = s.visitPrice != null;

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.avatarWrap}>
            <Image
              source={avatarSource}
              style={styles.avatar}
              onLoadStart={() => __DEV__ && console.log('[AVATAR][LIST][LOAD_START]', avatarUrl)}
              onLoadEnd={() => __DEV__ && console.log('[AVATAR][LIST][LOAD_END]', avatarUrl)}
              onError={(e) =>
                __DEV__ && console.log('[AVATAR][LIST][ERROR]', avatarUrl, e?.nativeEvent)
              }
            />
          </View>
        </View>

        <View style={styles.cardMid}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {s.name || 'Especialista'}
            </Text>
            <View
              style={[styles.statusDotInline, { backgroundColor: online ? '#22c55e' : '#ef4444' }]}
            />
          </View>

          <View style={styles.row}>
            <Ionicons name="star" size={14} color="#ffd166" />
            <Text style={styles.muted}>
              {s.ratingAvg != null ? s.ratingAvg.toFixed(1) : '0.0'} ({s.ratingCount ?? 0})
            </Text>
            <Text style={styles.dotSep}>•</Text>
            <Ionicons name="navigate" size={14} color="#E9FEFF" />
            <Text style={styles.muted}>{distanceLabel(s.distanceKm)}</Text>
          </View>

          <View style={styles.pillsRow}>
            <View style={[styles.pillSolid, isEnabled ? styles.pillGood : styles.pillBad]}>
              <MDI name="badge-account-horizontal-outline" size={14} color="#E9FEFF" />
              <Text style={styles.pillSolidText}>
                {isEnabled === true ? 'Habilitado' : isEnabled === false ? 'No habilitado' : '—'}
              </Text>
            </View>

            <View style={[styles.pillSolid, online ? styles.pillGood : styles.pillBad]}>
              <MDI name="clock-outline" size={14} color="#E9FEFF" />
              <Text style={styles.pillSolidText}>{online ? 'Disponible' : 'No disponible'}</Text>
            </View>

            {showPricePill ? (
              <View style={styles.pillSoft}>
                <MDI name="currency-usd" size={14} color="#E9FEFF" />
                <Text style={styles.pillSoftText}>
                  {pricePillLabel(s)}: {priceText(s.visitPrice)}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.ctaWide, pressed && { opacity: 0.9 }]}
            onPress={() => {
              const coords = lastCoords.current;
              nav.navigate('SpecialistProfile', {
                id: s.specialistId,
                lat: coords?.lat,
                lng: coords?.lng,
                categorySlug: dbCategorySlug,
              } as any);
            }}
          >
            <Text style={styles.ctaWideText}>Ver perfil</Text>
            <Ionicons name="chevron-forward" size={18} color="#06494F" />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>Solucity</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
          <Text style={styles.title}>{params.title}</Text>
          <Text style={styles.subtitle}>Especialistas cerca de tu ubicación</Text>
        </View>

        <FiltersBar />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E9FEFF" />
            <Text style={{ color: '#E9FEFF', marginTop: 8 }}>Buscando especialistas…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: '#ffd5d5', fontWeight: '700' }}>Error</Text>
            <Text style={{ color: '#FFECEC', marginTop: 4 }}>{error}</Text>
            <Pressable
              style={[styles.ctaWide, { marginTop: 12, alignSelf: 'center' }]}
              onPress={() => fetchData(true)}
            >
              <Text style={styles.ctaWideText}>Reintentar</Text>
              <Ionicons name="refresh" size={18} color="#06494F" />
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(s) => s.specialistId}
            renderItem={({ item }) => <SpecialistCard s={item} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 120,
              flexGrow: list.length === 0 ? 1 : 0,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchData(true)}
                tintColor="#fff"
              />
            }
            ListEmptyComponent={
              <View style={[styles.center, { paddingTop: 24 }]}>
                <Text style={{ color: '#E9FEFF' }}>
                  {' '}
                  No encontramos especialistas disponibles en tu zona.
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 26, height: 26 },
  brandText: { color: '#E9FEFF', fontWeight: '800', fontSize: 22, letterSpacing: 0.5 },

  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: 'rgba(233,254,255,0.9)', marginTop: 4, marginBottom: 8 },

  filtersRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.5)',
  },
  filterChipOn: { backgroundColor: '#E9FEFF' },
  filterText: { color: '#E9FEFF', fontWeight: '700' },
  filterTextOn: { color: '#06494F' },

  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },

  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 22,
    padding: 14,
    marginTop: 14,
  },

  cardLeft: { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#083840',
    borderWidth: 3,
    borderColor: 'rgba(233,254,255,0.5)',
  },
  avatar: { width: '100%', height: '100%' },

  cardMid: { flex: 1 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { color: '#E9FEFF', fontWeight: '900', fontSize: 18, flexShrink: 1 },

  statusDotInline: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#00333A',
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { color: 'rgba(233,254,255,0.9)' },
  dotSep: { color: 'rgba(233,254,255,0.6)', marginHorizontal: 2 },

  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },

  pillSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(233,254,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.25)',
  },
  pillSoftText: { color: '#E9FEFF', fontWeight: '800' },

  pillSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.25)',
  },
  pillSolidText: { color: '#E9FEFF', fontWeight: '900' },

  pillGood: { backgroundColor: 'rgba(34, 197, 94, 0.22)' },
  pillBad: { backgroundColor: 'rgba(239, 68, 68, 0.18)' },

  ctaWide: {
    marginTop: 12,
    backgroundColor: '#E9FEFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ctaWideText: { color: '#06494F', fontWeight: '900', fontSize: 14 },
});
