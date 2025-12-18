// apps/mobile/src/screens/SpecialistsListScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons'
import type { RouteProp } from '@react-navigation/native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Constants from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { HomeStackParamList } from '../types'

// ===== Tipos =====
type SpecialistsRoute = RouteProp<HomeStackParamList, 'SpecialistsList'>

type SpecialistRow = {
  specialistId: string
  centerLat: number | null
  centerLng: number | null
  radiusKm: number | null
  ratingAvg: number | null
  ratingCount: number | null
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null
  visitPrice?: number | null
  availableNow: boolean
  verified: boolean
  distanceKm: number
  name?: string
  avatarUrl?: string | null
  enabled?: boolean
  kycStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'
}

type SortBy = 'distance' | 'rating' | 'price'

// ===== Config =====
const API_URL =
  (Constants.expoConfig?.extra as any)?.API_URL ??
  (Constants.manifest2 as any)?.extra?.API_URL ??
  (Constants.manifest as any)?.extra?.API_URL

const RADIUS_KM_DEFAULT = 8

// Cache en memoria (categoría + coords redondeadas + flags) -> resultados
const resultsCache = new Map<string, { at: number; items: SpecialistRow[] }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

export default function SpecialistsListScreen() {
  const { params } = useRoute<SpecialistsRoute>()
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>()

  const dbCategorySlug = params.categorySlug

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<SpecialistRow[]>([])

  // Filtros que impactan en backend
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined)

  // Orden local
  const [sortBy, setSortBy] = useState<SortBy>('distance')

  const lastCoords = useRef<{ lat: number; lng: number } | null>(null)

  const fetchData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)
        setError(null)

        // 1) permisos + ubicación actual
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') throw new Error('Permiso de ubicación denegado')

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        lastCoords.current = { lat, lng }

        // 2) cache key
        const latKey = lat.toFixed(2)
        const lngKey = lng.toFixed(2)
        const key = [
          dbCategorySlug,
          latKey,
          lngKey,
          RADIUS_KM_DEFAULT,
          onlyEnabled ? 'E1' : 'E0',
          onlyAvailable ? 'A1' : 'A0',
          priceMax ?? 'Px',
        ].join('|')

        // 3) servir cache si está fresco
        const hit = resultsCache.get(key)
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
          setItems(hit.items)
          return
        }

        // 4) pedir al backend
        const q = new URLSearchParams()
        q.set('category', dbCategorySlug)
        q.set('lat', String(lat))
        q.set('lng', String(lng))
        q.set('radiusKm', String(RADIUS_KM_DEFAULT))
        if (onlyEnabled) q.set('verified', 'true')
        if (onlyAvailable) q.set('availableNow', 'true')
        if (priceMax != null) q.set('priceMax', String(priceMax))

        const url = `${API_URL}/specialists/search?${q.toString()}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: SpecialistRow[] = await res.json()

        setItems(data)
        resultsCache.set(key, { at: Date.now(), items: data })
      } catch (e: any) {
        setError(e?.message ?? 'Error desconocido')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [dbCategorySlug, onlyAvailable, onlyEnabled, priceMax],
  )

  // Recargar cada vez que la pantalla gana foco (incluye la primera vez)
  useFocusEffect(
    useCallback(() => {
      fetchData(true)
    }, [fetchData]),
  )

  const list = useMemo(() => {
    const arr = items.slice()
    switch (sortBy) {
      case 'distance':
        arr.sort((a, b) => a.distanceKm - b.distanceKm)
        break
      case 'rating':
        arr.sort(
          (a, b) =>
            (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) ||
            (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
        )
        break
      case 'price':
        arr.sort((a, b) => (a.visitPrice ?? Infinity) - (b.visitPrice ?? Infinity))
        break
    }
    return arr
  }, [items, sortBy])

  const distanceLabel = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`
    if (km < 10) return `${km.toFixed(1)} km`
    return `${Math.round(km)} km`
  }

  const badgeLabel: Record<NonNullable<SpecialistRow['badge']>, string> = {
    BRONZE: 'Bronce',
    SILVER: 'Plata',
    GOLD: 'Oro',
    PLATINUM: 'Platino',
  }

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
          <MDI
            name="currency-usd"
            size={16}
            color={sortBy === 'price' ? '#06494F' : '#E9FEFF'}
          />
          <Text style={[styles.filterText, sortBy === 'price' && styles.filterTextOn]}>
            Precio
          </Text>
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
          <Text style={[styles.filterText, onlyEnabled && styles.filterTextOn]}>
            Habilitados
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            onlyAvailable && styles.filterChipOn,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => setOnlyAvailable((v) => !v)}
        >
          <MDI
            name="clock-outline"
            size={16}
            color={onlyAvailable ? '#06494F' : '#E9FEFF'}
          />
          <Text style={[styles.filterText, onlyAvailable && styles.filterTextOn]}>
            Disponibles
          </Text>
        </Pressable>
      </View>
    </View>
  )

  const SpecialistCard = ({ s }: { s: SpecialistRow }) => {
    const online = s.availableNow
    const avatarSource =
      s.avatarUrl && s.avatarUrl.startsWith('http')
        ? { uri: s.avatarUrl }
        : s.avatarUrl
        ? {
            uri: `${API_URL?.replace(/\/+$/, '')}${
              s.avatarUrl.startsWith('/') ? '' : '/'
            }${s.avatarUrl}`,
          }
        : require('../assets/avatar-placeholder.png')

    const isEnabled = s.enabled ?? s.verified
    const badgeText = s.badge != null ? badgeLabel[s.badge] : 'Bronce'

    return (
      <View style={styles.card}>
        {/* Avatar (más grande) */}
        <View style={styles.cardLeft}>
          <View style={styles.avatarWrap}>
            <Image source={avatarSource} style={styles.avatar} />
          </View>
        </View>

        {/* Info principal */}
        <View style={styles.cardMid}>
          {/* Nombre + punto de estado inline */}
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {s.name || 'Especialista'}
            </Text>
            <View
              style={[
                styles.statusDotInline,
                { backgroundColor: online ? '#22c55e' : '#ef4444' },
              ]}
            />
          </View>

          <View style={styles.row}>
            <Ionicons name="star" size={14} color="#ffd166" />
            <Text style={styles.muted}>
              {s.ratingAvg != null ? s.ratingAvg.toFixed(1) : '0.0'} (
              {s.ratingCount ?? 0})
            </Text>
            <Text style={styles.dotSep}>•</Text>
            <Ionicons name="navigate" size={14} color="#E9FEFF" />
            <Text style={styles.muted}>{distanceLabel(s.distanceKm)}</Text>
          </View>

          <View style={[styles.row, { marginTop: 2 }]}>
            <MDI name="medal-outline" size={14} color="#E9FEFF" />
            <Text style={styles.muted}>{badgeText}</Text>
            <Text style={styles.dotSep}>•</Text>
            <MDI
              name="badge-account-horizontal-outline"
              size={14}
              color={isEnabled ? '#22c55e' : '#ef4444'}
            />
            <Text style={styles.muted}>
              {isEnabled ? 'Habilitado' : 'No hab.'}
            </Text>
          </View>

          {/* Precio como “Visita” en una pill corta */}
          <View style={styles.pricePill}>
            <Text style={styles.pricePillText}>
              Visita:{' '}
              {s.visitPrice != null
                ? `$${s.visitPrice.toLocaleString('es-AR')}`
                : '—'}
            </Text>
          </View>
        </View>

        {/* Botón Ver perfil */}
        <View style={styles.cardRight}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            onPress={() => {
              nav.navigate('SpecialistProfile', { id: s.specialistId })
            }}
          >
            <Text style={styles.ctaText}>Ver perfil</Text>
          </Pressable>
        </View>
      </View>
    )
  }

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
            <Text style={{ color: '#E9FEFF', marginTop: 8 }}>
              Buscando especialistas…
            </Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: '#ffd5d5', fontWeight: '700' }}>Error</Text>
            <Text style={{ color: '#FFECEC', marginTop: 4 }}>{error}</Text>
            <Pressable
              style={[styles.cta, { marginTop: 12 }]}
              onPress={() => fetchData()}
            >
              <Text style={styles.ctaText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchData(true)}
                tintColor="#fff"
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {list.length === 0 ? (
              <View style={[styles.center, { paddingTop: 24 }]}>
                <Text style={{ color: '#E9FEFF' }}>
                  No encontramos especialistas en 8km.
                </Text>
              </View>
            ) : (
              list.map((s) => <SpecialistCard key={s.specialistId} s={s} />)
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  )
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
    justifyContent: 'center',
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

  cardMid: { flex: 1, paddingRight: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  name: { color: '#E9FEFF', fontWeight: '900', fontSize: 17 },
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

  pricePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: 'rgba(233,254,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.35)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pricePillText: { color: '#E9FEFF', fontWeight: '800' },

  cardRight: { alignItems: 'flex-end', justifyContent: 'center' },
  cta: {
    backgroundColor: '#E9FEFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  ctaText: { color: '#06494F', fontWeight: '900', fontSize: 13 },
})












