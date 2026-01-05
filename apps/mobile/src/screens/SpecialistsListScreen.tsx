// apps/mobile/src/screens/SpecialistsListScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types';

// ===== Tipos =====
type SpecialistsRoute = RouteProp<HomeStackParamList, 'SpecialistsList'>;

type SpecialistRow = {
  specialistId: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;
  visitPrice?: number | null;

  // ✅ NUEVO: etiqueta de forma de cobro (viene del backend: pricingLabel)
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
const API_URL =
  (Constants.expoConfig?.extra as any)?.API_URL ??
  (Constants.manifest2 as any)?.extra?.API_URL ??
  (Constants.manifest as any)?.extra?.API_URL;

const RADIUS_KM_DEFAULT = 8;

// Cache en memoria (categoría + coords redondeadas + flags) -> resultados
const resultsCache = new Map<string, { at: number; items: SpecialistRow[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ✅ Nuevo: umbral para considerar que el usuario “se movió”
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
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined);

  // Orden local
  const [sortBy, setSortBy] = useState<SortBy>('distance');

  // Últimas coords conocidas
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);

  // ✅ Nuevo: para saber si estamos consultando “lo mismo”
  const lastKeyRef = useRef<string | null>(null);

  /**
   * ✅ Pide permiso sólo si hace falta, y devuelve coords actuales.
   * Si "forceFresh" es false, permite reutilizar coords previas si el usuario no se movió “lo suficiente”
   * para evitar llamadas innecesarias al backend.
   */
  const getCoordsSmart = useCallback(async (forceFresh: boolean) => {
    // 1) permisos
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') throw new Error('Permiso de ubicación denegado');
    }

    // 2) si no tenemos coords aún -> tomarlas
    if (!lastCoords.current) {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      lastCoords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      return { coords: lastCoords.current, movedKm: Infinity };
    }

    // 3) si no forzamos refresh, igual tomamos posición “actual” para medir movimiento,
    // pero la lógica de “evitar backend” se hace luego (con cache/key/TTL)
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const movedKm = haversineKm(lastCoords.current, fresh);

    if (!forceFresh && movedKm < MOVED_THRESHOLD_KM) {
      // no actualizamos lastCoords, devolvemos la anterior
      return { coords: lastCoords.current, movedKm };
    }

    // si se movió, actualizamos
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
        onlyAvailable ? 'A1' : 'A0',
        priceMax ?? 'Px',
      ].join('|');
    },
    [dbCategorySlug, onlyAvailable, onlyEnabled, priceMax],
  );

  const fetchData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        // ✅ coords inteligentes:
        // - en refresh forzamos coords frescas
        // - en foco normal intentamos reutilizar si no hubo movimiento
        const { coords, movedKm } = await getCoordsSmart(isRefresh);

        const lat = coords.lat;
        const lng = coords.lng;

        const key = buildCacheKey(lat, lng);

        // ✅ 1) Si NO es refresh, NO se movió, y la key es la misma, y el cache está fresco -> NO tocar backend
        const hit = resultsCache.get(key);
        const cacheFresh = hit && Date.now() - hit.at < CACHE_TTL_MS;

        if (
          !isRefresh &&
          movedKm < MOVED_THRESHOLD_KM &&
          lastKeyRef.current === key &&
          cacheFresh
        ) {
          // ya tenemos lo mismo y está fresco
          setItems(hit.items);
          return;
        }

        // ✅ 2) Si hay cache fresco, usarlo (incluso si se movió poco o cambió key por redondeo)
        if (cacheFresh) {
          setItems(hit.items);
          lastKeyRef.current = key;
          return;
        }

        // ✅ 3) Backend
        const q = new URLSearchParams();
        q.set('category', dbCategorySlug);
        q.set('lat', String(lat));
        q.set('lng', String(lng));
        q.set('radiusKm', String(RADIUS_KM_DEFAULT));
        if (onlyEnabled) q.set('enabled', 'true');
        if (onlyAvailable) q.set('availableNow', 'true');
        if (priceMax != null) q.set('priceMax', String(priceMax));

        const url = `${API_URL}/specialists/search?${q.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json: SpecialistRow[] = await res.json();

        setItems(json);
        resultsCache.set(key, { at: Date.now(), items: json });
        lastKeyRef.current = key;
      } catch (e: any) {
        setError(e?.message ?? 'Error desconocido');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [API_URL, buildCacheKey, dbCategorySlug, getCoordsSmart, onlyAvailable, onlyEnabled, priceMax],
  );

  /**
   * ✅ En foco:
   * - NO forzamos refresh
   * - Deja que la lógica decida si evita backend
   */
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        try {
          await getCoordsSmart(false);
          if (!alive) return;
          await fetchData(false);
        } catch (e: any) {
          if (!alive) return;
          setError(e?.message ?? 'Error desconocido');
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
    const arr = items.slice();
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

  const badgeLabel: Record<NonNullable<SpecialistRow['badge']>, string> = {
    BRONZE: 'Bronce',
    SILVER: 'Plata',
    GOLD: 'Oro',
    PLATINUM: 'Platino',
  };

  const priceText = (visitPrice?: number | null) => {
    if (visitPrice == null) return '—';
    return `$${visitPrice.toLocaleString('es-AR')}`;
  };

  // ✅ NUEVO: etiqueta para el pill de precio (fallback a "Visita")
  const pricePillLabel = (s: SpecialistRow) => {
    const label = (s.pricingLabel ?? '').trim();
    return label.length ? label : 'Visita';
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

        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            onlyAvailable && styles.filterChipOn,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => setOnlyAvailable((v) => !v)}
        >
          <MDI name="clock-outline" size={16} color={onlyAvailable ? '#06494F' : '#E9FEFF'} />
          <Text style={[styles.filterText, onlyAvailable && styles.filterTextOn]}>Disponibles</Text>
        </Pressable>
      </View>
    </View>
  );

  const SpecialistCard = ({ s }: { s: SpecialistRow }) => {
    const online = s.availableNow;

    const avatarSource =
      s.avatarUrl && s.avatarUrl.startsWith('http')
        ? { uri: s.avatarUrl }
        : s.avatarUrl
          ? {
              uri: `${API_URL?.replace(/\/+$/, '')}${s.avatarUrl.startsWith('/') ? '' : '/'}${
                s.avatarUrl
              }`,
            }
          : require('../assets/avatar-placeholder.png');

    const isEnabled = s.enabled ?? s.verified;
    const badgeText = s.badge != null ? badgeLabel[s.badge] : 'Bronce';

    return (
      <View style={styles.card}>
        {/* Left: Avatar */}
        <View style={styles.cardLeft}>
          <View style={styles.avatarWrap}>
            <Image source={avatarSource} style={styles.avatar} />
          </View>
        </View>

        {/* Mid: content */}
        <View style={styles.cardMid}>
          {/* Header row: Name + online dot */}
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {s.name || 'Especialista'}
            </Text>
            <View
              style={[styles.statusDotInline, { backgroundColor: online ? '#22c55e' : '#ef4444' }]}
            />
          </View>

          {/* Rating + distance */}
          <View style={styles.row}>
            <Ionicons name="star" size={14} color="#ffd166" />
            <Text style={styles.muted}>
              {s.ratingAvg != null ? s.ratingAvg.toFixed(1) : '0.0'} ({s.ratingCount ?? 0})
            </Text>
            <Text style={styles.dotSep}>•</Text>
            <Ionicons name="navigate" size={14} color="#E9FEFF" />
            <Text style={styles.muted}>{distanceLabel(s.distanceKm)}</Text>
          </View>

          {/* Pills row (wrap) */}
          <View style={styles.pillsRow}>
            <View style={styles.pillSoft}>
              <MDI name="medal-outline" size={14} color="#E9FEFF" />
              <Text style={styles.pillSoftText}>{badgeText}</Text>
            </View>

            <View style={[styles.pillSolid, isEnabled ? styles.pillGood : styles.pillBad]}>
              <MDI name="badge-account-horizontal-outline" size={14} color="#E9FEFF" />
              <Text style={styles.pillSolidText}>{isEnabled ? 'Habilitado' : 'No habilitado'}</Text>
            </View>

            <View style={[styles.pillSolid, online ? styles.pillGood : styles.pillBad]}>
              <MDI name="clock-outline" size={14} color="#E9FEFF" />
              <Text style={styles.pillSolidText}>{online ? 'Disponible' : 'No disponible'}</Text>
            </View>

            {/* ✅ Precio en pill usando pricingLabel (fallback a "Visita") */}
            <View style={styles.pillSoft}>
              <MDI name="currency-usd" size={14} color="#E9FEFF" />
              <Text style={styles.pillSoftText}>
                {pricePillLabel(s)}: {priceText(s.visitPrice)}
              </Text>
            </View>
          </View>

          {/* CTA full width */}
          <Pressable
            style={({ pressed }) => [styles.ctaWide, pressed && { opacity: 0.9 }]}
            onPress={() => {
              nav.navigate('SpecialistProfile', { id: s.specialistId });
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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>solucity</Text>
          </View>
        </View>

        {/* Título */}
        <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
          <Text style={styles.title}>{params.title}</Text>
          <Text style={styles.subtitle}>Especialistas cerca de tu ubicación</Text>
        </View>

        {/* Filtros */}
        <FiltersBar />

        {/* Lista */}
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
                <Text style={{ color: '#E9FEFF' }}>No encontramos especialistas en 8km.</Text>
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
  filterChipOn: {
    backgroundColor: '#E9FEFF',
  },
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

  cardLeft: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#083840',
    borderWidth: 3,
    borderColor: 'rgba(233,254,255,0.5)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },

  cardMid: { flex: 1 },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
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

  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },

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
