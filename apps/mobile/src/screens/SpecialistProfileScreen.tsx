// apps/mobile/src/screens/SpecialistProfileScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ensureInquiryChat } from '../api/chat';
import { useAuth } from '../auth/AuthProvider';
import { trackEvent } from '../lib/analytics';
import { API_URL, api } from '../lib/api';
import { resolveUploadUrl } from '../lib/resolveUploadUrl';

import type { HomeStackParamList } from '../types';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Route = RouteProp<HomeStackParamList, 'SpecialistProfile'>;

/** 👇 Tipo para cada reseña */
type Review = {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  avatarUrl: string | null;
  createdAt: string;
};

type PortfolioItem = {
  id: string;
  imageUrl: string;
  thumbUrl?: string | null;
  caption?: string | null;
  sortOrder: number;
  createdAt: string;
};

type SpecialistDetails = {
  id: string;
  name: string;
  businessName?: string | null;
  avatarUrl?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  badge?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;
  enabled?: boolean;
  availableNow?: boolean;
  visitPrice?: number | null;
  pricingLabel?: string | null;
  currency?: string | null;
  bio?: string | null;
  distanceKm?: number | null;
  availability?: { days: number[]; start: string; end: string } | null;
  specialties?: { id: string; name: string; slug: string }[];
  stats?: { done: number; canceled: number };
  reviews: Review[];
};

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export default function SpecialistProfileScreen() {
  const { params } = useRoute<Route>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const auth = useAuth() as any;
  const isGuest = !auth?.user;

  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useContext(BottomTabBarHeightContext);
  const tabBarHeightRaw = bottomTabBarHeight ?? 0;
  const tabBarHeight = tabBarHeightRaw > 0 ? Math.max(tabBarHeightRaw, 60) : 0;
  const ctaBottom = Platform.OS === 'web' ? 24 : tabBarHeight + insets.bottom + 12;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<SpecialistDetails | null>(null);
  const [startingInquiry, setStartingInquiry] = useState(false);

  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioPreviewOpen, setPortfolioPreviewOpen] = useState(false);
  const [portfolioPreviewUri, setPortfolioPreviewUri] = useState<string | null>(null);
  const specialistId = params.id;
  const routeLat = (params as any)?.lat as number | undefined;
  const routeLng = (params as any)?.lng as number | undefined;
  const routeCategorySlug = (params as any)?.categorySlug as string | undefined;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ si vienen lat/lng desde la lista, los usamos y NO pedimos GPS.
        const maybeLat = routeLat;
        const maybeLng = routeLng;

        let lat: number;
        let lng: number;

        if (typeof maybeLat === 'number' && typeof maybeLng === 'number') {
          lat = maybeLat;
          lng = maybeLng;
        } else if (Platform.OS === 'web') {
          // ✅ En web evitamos bloquear la pantalla pidiendo GPS si no vino desde la lista
          lat = 0;
          lng = 0;
        } else {
          // fallback nativo: pedir ubicación
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== 'granted') throw new Error('No se pudo obtener tu ubicación');

          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }

        // ✅ rubro desde el que venimos (opcional)
        const categorySlug = routeCategorySlug;

        // ✅ usar api (axios) para que vaya con Authorization + interceptores
        const res = await api.get(`/specialists/${specialistId}`, {
          params: {
            lat,
            lng,
            ...(categorySlug ? { category: categorySlug } : {}),
          },
        });

        const data = res.data as any;

        const normalized: SpecialistDetails = {
          id: data.id,
          name: data.name,
          businessName: data.businessName ?? data.business_name ?? null,
          avatarUrl: data.avatarUrl,
          ratingAvg: data.ratingAvg,
          ratingCount: data.ratingCount,
          badge: data.badge,
          enabled: data.enabled,
          availableNow: data.availableNow,
          visitPrice: data.visitPrice,
          pricingLabel: data.pricingLabel ?? null,
          currency: data.currency,
          bio: data.bio,
          distanceKm: data.distanceKm,
          availability: data.availability,
          specialties: data.specialties || [],
          stats: data.stats,
          reviews: Array.isArray(data.reviews) ? data.reviews : [],
        };

        if (!alive) return;
        setSpec(normalized);
      } catch (e: any) {
        if (!alive) return;

        const status = e?.response?.status;
        if (status === 401) setError('Tu sesión venció. Volvé a iniciar sesión.');
        else if (status) setError(`Error del servidor (HTTP ${status}).`);
        else setError('No se pudo cargar el perfil.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [specialistId, routeLat, routeLng, routeCategorySlug]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setPortfolioLoading(true);

        const res = await api.get(`/specialists/${specialistId}/portfolio`, {
          headers: { 'Cache-Control': 'no-cache' },
        });

        const items = Array.isArray(res.data?.items) ? res.data.items : [];

        if (!alive) return;
        setPortfolio(items);
      } catch (e) {
        if (!alive) return;
        if (__DEV__) console.log('[SpecialistProfile] portfolio error', e);
        setPortfolio([]);
      } finally {
        if (!alive) return;
        setPortfolioLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [specialistId]);

  useEffect(() => {
    trackEvent({
      eventType: 'view_specialist_profile',
      screen: 'SpecialistProfileScreen',
      categorySlug: String(routeCategorySlug ?? ''),
      specialistId: String(specialistId),
      metadata: {
        source: 'specialist_profile_screen',
      },
    });
  }, [routeCategorySlug, specialistId]);

  // ✅ unificamos: usar resolveUploadUrl como en la lista
  const resolvedAvatarUrl = useMemo(
    () => resolveUploadUrl(spec?.avatarUrl ?? null),
    [spec?.avatarUrl],
  );

  const avatarSource = useMemo(() => {
    if (resolvedAvatarUrl) return { uri: resolvedAvatarUrl };
    return require('../assets/avatar-placeholder.png');
  }, [resolvedAvatarUrl]);

  const visiblePortfolio = useMemo(() => portfolio.slice(0, 3), [portfolio]);

  // ✅ LOG general (evita TS2448 porque corre después de crear avatarSource)
  useEffect(() => {
    if (!__DEV__) return;
    console.log('[AVATAR][PROFILE]', {
      name: spec?.name,
      avatarUrl: spec?.avatarUrl,
      resolved: resolvedAvatarUrl ?? null,
      API_URL,
    });
  }, [resolvedAvatarUrl, spec?.avatarUrl, spec?.name]);

  const distanceLabel = (km?: number | null) => {
    if (km == null || !Number.isFinite(km)) return '—';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
  };

  const availability = spec?.availability ?? { days: [], start: '09:00', end: '18:00' };
  const days = availability.days ?? [];

  const statsDone = spec?.stats?.done ?? 0;
  const statsCanceled = spec?.stats?.canceled ?? 0;

  const specialties = spec?.specialties ?? [];

  const showPrice = spec?.visitPrice != null;
  const pricingLabel = (spec?.pricingLabel ?? '').trim() || 'Tarifa';

  function handleGuestBlockedAction() {
    const rootNav = nav.getParent?.() as any;

    if (Platform.OS === 'web') {
      const goLogin = window.confirm(
        'Necesitás iniciar sesión para continuar.\n\nPodés explorar especialistas libremente. Para contratar o consultar presupuesto, iniciá sesión o creá una cuenta.',
      );

      if (goLogin) {
        rootNav?.navigate?.('Login');
      }
      return;
    }

    Alert.alert(
      'Necesitás una cuenta',
      'Podés explorar especialistas libremente. Para contratar o consultar presupuesto, necesitás iniciar sesión o crear una cuenta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar sesión',
          onPress: () => rootNav?.navigate?.('Login'),
        },
        {
          text: 'Crear cuenta',
          onPress: () => rootNav?.navigate?.('ChooseRole'),
        },
      ],
    );
  }

  async function handleStartInquiry() {
    if (isGuest) {
      handleGuestBlockedAction();
      return;
    }
    if (!spec?.id) return;

    try {
      setStartingInquiry(true);

      const thread = await ensureInquiryChat(spec.id, routeCategorySlug ?? null);

      trackEvent({
        eventType: 'inquiry_created',
        screen: 'SpecialistProfileScreen',
        categorySlug: String(routeCategorySlug ?? ''),
        specialistId: String(spec.id),
        metadata: {
          source: 'specialist_profile',
          specialistName: spec.businessName?.trim() || spec.name || 'Especialista',
          threadType: 'INQUIRY',
        },
      });

      const parent = (nav as any).getParent?.();

      if (parent?.navigate) {
        parent.navigate('Chat', {
          screen: 'ChatThread',
          params: {
            threadId: thread.id,
            title: spec.businessName?.trim() || spec.name,
            businessName: spec.businessName?.trim() || null,
            threadType: 'INQUIRY',
            specialistId: spec.id,
            categorySlug: routeCategorySlug ?? null,
          },
        });
      } else {
        (nav as any).navigate('ChatThread', {
          threadId: thread.id,
          title: spec.businessName?.trim() || spec.name,
          businessName: spec.businessName?.trim() || null,
          threadType: 'INQUIRY',
          specialistId: spec.id,
          categorySlug: routeCategorySlug ?? null,
        });
      }
    } catch (e) {
      if (__DEV__) console.log('[SpecialistProfile] inquiry error', e);
    } finally {
      setStartingInquiry(false);
    }
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header simple: back + título "Perfil" */}
        <View style={styles.header}>
          <Pressable
            onPress={() => nav.goBack()}
            style={({ pressed }) => [{ padding: 6, marginRight: 8 }, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E9FEFF" />
            <Text style={{ color: '#E9FEFF', marginTop: 8 }}>Cargando perfil…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: '#ffd5d5', fontWeight: '700' }}>Ups</Text>
            <Text style={{ color: '#FFECEC', marginTop: 4, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : !spec ? (
          <View style={styles.center}>
            <Text style={{ color: '#E9FEFF' }}>No encontramos este especialista.</Text>
          </View>
        ) : (
          <View style={styles.body}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: Platform.OS === 'web' ? 140 : ctaBottom + 140,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Header del perfil */}
              <View style={styles.topCard}>
                <View style={styles.avatarWrap}>
                  <Image
                    source={avatarSource}
                    style={styles.avatar}
                    onLoadStart={() => {
                      if (__DEV__ && resolvedAvatarUrl)
                        console.log('[AVATAR][PROFILE][LOAD_START]', resolvedAvatarUrl);
                    }}
                    onLoadEnd={() => {
                      if (__DEV__ && resolvedAvatarUrl)
                        console.log('[AVATAR][PROFILE][LOAD_END]', resolvedAvatarUrl);
                    }}
                    onError={(ev) => {
                      if (__DEV__ && resolvedAvatarUrl)
                        console.log('[AVATAR][PROFILE][ERROR]', resolvedAvatarUrl, ev?.nativeEvent);
                    }}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.name}>{spec.businessName?.trim() || spec.name}</Text>

                  <View style={styles.row}>
                    <Ionicons name="star" size={16} color="#FFD166" />
                    <Text style={styles.muted}>
                      {spec.ratingAvg != null ? spec.ratingAvg.toFixed(1) : '0.0'} (
                      {spec.ratingCount ?? 0})
                    </Text>
                    <Text style={styles.dotSep}>•</Text>
                    <Ionicons name="navigate" size={16} color="#E9FEFF" />
                    <Text style={styles.muted}>{distanceLabel(spec.distanceKm)}</Text>
                  </View>

                  {/*
<View style={[styles.row, { marginTop: 4 }]}>
  <MDI name="shield-check-outline" size={16} color="#E9FEFF" />
  <Text style={styles.muted}>
    {spec.enabled ? 'Habilitado' : 'No habilitado'}
  </Text>
</View>
*/}
                </View>
              </View>

              {/* ✅ Precio: solo si hay precio */}
              {showPrice ? (
                <View style={styles.priceCard}>
                  <MDI name="currency-usd" size={18} color="#0A5B63" />
                  <Text style={styles.priceText}>
                    {pricingLabel}: ${spec.visitPrice!.toLocaleString('es-AR')}
                  </Text>
                </View>
              ) : null}

              {/* Sobre mí */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <MDI name="briefcase-outline" size={18} color="#E9FEFF" />
                  <Text style={styles.sectionTitle}>Sobre mí</Text>
                </View>
                <Text style={styles.sectionBody}>
                  {spec.bio && spec.bio.trim().length > 0
                    ? spec.bio
                    : 'Este especialista todavía no cargó su biografía.'}
                </Text>
              </View>

              {/* Horarios */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <MDI name="calendar-range-outline" size={18} color="#E9FEFF" />
                  <Text style={styles.sectionTitle}>Horarios</Text>
                </View>

                <View style={styles.daysRow}>
                  {DAY_LABELS.map((lbl, idx) => {
                    const on = days.includes(idx);
                    return (
                      <View
                        key={lbl}
                        style={[styles.dayChip, on ? styles.dayChipOn : styles.dayChipOff]}
                      >
                        <Text
                          style={[
                            styles.dayChipText,
                            on ? { color: '#063A40' } : { color: '#9ec9cd' },
                          ]}
                        >
                          {lbl}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <Text style={[styles.sectionBody, { marginTop: 10 }]}>
                  {availability.start && availability.end
                    ? `Atiende de ${availability.start} a ${availability.end}.`
                    : 'Horario no especificado.'}
                </Text>
              </View>

              {/* Rubros */}
              {specialties.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <MDI name="hammer-screwdriver" size={18} color="#E9FEFF" />
                    <Text style={styles.sectionTitle}>Rubros</Text>
                  </View>
                  <View style={styles.tagsRow}>
                    {specialties.map((s) => (
                      <View key={s.id} style={styles.tagChip}>
                        <Text style={styles.tagText}>{s.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Trabajos realizados */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <MDI name="image-multiple-outline" size={18} color="#E9FEFF" />
                  <Text style={styles.sectionTitle}>Trabajos realizados</Text>
                </View>

                {portfolioLoading ? (
                  <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <ActivityIndicator color="#E9FEFF" />
                    <Text style={[styles.sectionBody, { marginTop: 8 }]}>Cargando imágenes…</Text>
                  </View>
                ) : portfolio.length === 0 ? (
                  <Text style={styles.sectionBody}>
                    Este especialista todavía no cargó imágenes de trabajos realizados.
                  </Text>
                ) : (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 10, paddingTop: 6 }}
                    >
                      {visiblePortfolio.map((item) => {
                        const uri =
                          resolveUploadUrl(item.thumbUrl || item.imageUrl) || item.imageUrl;

                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              const full = resolveUploadUrl(item.imageUrl) || item.imageUrl;
                              setPortfolioPreviewUri(full);
                              setPortfolioPreviewOpen(true);
                            }}
                            style={styles.portfolioThumbWrap}
                          >
                            <Image
                              source={{ uri }}
                              style={styles.portfolioThumb}
                              resizeMode="cover"
                            />
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {portfolio.length > 3 ? (
                      <Text style={[styles.sectionBody, { marginTop: 10 }]}>
                        +{portfolio.length - 3} imagen{portfolio.length - 3 === 1 ? '' : 'es'} más
                      </Text>
                    ) : null}
                  </>
                )}
              </View>

              {/* Contrataciones */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <MDI name="clipboard-check-outline" size={18} color="#E9FEFF" />
                  <Text style={styles.sectionTitle}>Contrataciones</Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <MDI name="check-circle-outline" size={26} color="#E9FEFF" />
                    <Text style={styles.statNumber}>{statsDone}</Text>
                    <Text style={styles.statLabel}>Realizados</Text>
                  </View>
                  <View style={styles.statBox}>
                    <MDI name="close-circle-outline" size={26} color="#E9FEFF" />
                    <Text style={styles.statNumber}>{statsCanceled}</Text>
                    <Text style={styles.statLabel}>Cancelados</Text>
                  </View>
                </View>
              </View>

              {/* Reseñas */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="star-outline" size={18} color="#E9FEFF" />
                  <Text style={styles.sectionTitle}>Reseñas</Text>
                </View>

                {spec.reviews.length === 0 ? (
                  <Text style={styles.sectionBody}>Aún no hay reseñas.</Text>
                ) : (
                  spec.reviews.slice(0, 3).map((rev: Review) => (
                    <View key={rev.id} style={{ marginTop: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text style={[styles.sectionBody, { fontWeight: '700' }]}>
                          {rev.author}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="star" size={14} color="#FFD166" />
                          <Text style={styles.sectionBody}>{rev.rating.toFixed(1)}</Text>
                        </View>
                      </View>

                      {rev.comment && (
                        <Text style={[styles.sectionBody, { marginTop: 4 }]}>{rev.comment}</Text>
                      )}

                      <Text
                        style={[styles.sectionBody, { marginTop: 2, fontSize: 12, opacity: 0.7 }]}
                      >
                        {new Date(rev.createdAt).toLocaleDateString('es-AR')}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {/* Botones fijos inferiores */}
            <View
              style={[styles.fixedCtaContainer, { bottom: Platform.OS === 'web' ? 20 : ctaBottom }]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryCta,
                  pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
                  startingInquiry && { opacity: 0.7 },
                ]}
                disabled={startingInquiry}
                onPress={handleStartInquiry}
              >
                {startingInquiry ? (
                  <ActivityIndicator color="#E9FEFF" />
                ) : (
                  <>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#E9FEFF" />
                    <Text style={styles.secondaryCtaText}>Consultar presupuesto</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.mainCta,
                  pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
                ]}
                onPress={() => {
                  if (isGuest) {
                    handleGuestBlockedAction();
                    return;
                  }

                  const categorySlug = routeCategorySlug;

                  trackEvent({
                    eventType: 'tap_hire_from_profile',
                    screen: 'SpecialistProfileScreen',
                    categorySlug: String(categorySlug ?? ''),
                    specialistId: String(spec.id),
                    metadata: {
                      source: 'specialist_profile_cta',
                      specialistName: spec.businessName?.trim() || spec.name || 'Especialista',
                      visitPrice: spec.visitPrice ?? null,
                      pricingLabel: spec.pricingLabel ?? null,
                    },
                  });

                  nav.navigate('CreateOrder', {
                    specialistId: spec.id,
                    specialistName: spec.businessName?.trim() || spec.name,
                    visitPrice: spec.visitPrice ?? null,
                    pricingLabel: spec.pricingLabel ?? null,
                    categorySlug,
                  } as any);
                }}
              >
                <Text style={styles.mainCtaText}>Solicitar ahora</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      <Modal
        transparent
        visible={portfolioPreviewOpen}
        animationType="fade"
        onRequestClose={() => setPortfolioPreviewOpen(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewModalCard}>
            {portfolioPreviewUri ? (
              <Image source={{ uri: portfolioPreviewUri }} style={styles.previewModalImg} />
            ) : null}

            <Pressable
              style={styles.previewCloseBtn}
              onPress={() => {
                setPortfolioPreviewOpen(false);
                setPortfolioPreviewUri(null);
              }}
            >
              <Text style={styles.previewCloseBtnText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#E9FEFF',
    fontWeight: '900',
    fontSize: 20,
  },

  body: { flex: 1 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  topCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,35,40,0.32)',
    borderRadius: 22,
    padding: 16,
    marginTop: 6,
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(233,254,255,0.5)',
    backgroundColor: '#083840',
  },
  avatar: { width: '100%', height: '100%' },

  name: {
    color: '#E9FEFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { color: 'rgba(233,254,255,0.9)' },
  dotSep: { color: 'rgba(233,254,255,0.7)', marginHorizontal: 2 },

  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 10,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E9FEFF',
  },
  priceText: {
    marginLeft: 8,
    color: '#0A5B63',
    fontWeight: '900',
  },

  sectionCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,35,40,0.30)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#E9FEFF',
    fontWeight: '800',
    fontSize: 15,
  },
  sectionBody: {
    color: '#D4F4F7',
    fontSize: 14,
  },

  daysRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dayChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipOn: { backgroundColor: 'rgba(233,254,255,0.9)' },
  dayChipOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  dayChipText: { fontWeight: '800' },

  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(233,254,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.45)',
  },
  tagText: {
    color: '#E9FEFF',
    fontWeight: '700',
    fontSize: 13,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,45,52,0.9)',
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    color: '#E9FEFF',
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    color: '#B9E2E5',
    fontSize: 13,
  },

  fixedCtaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  secondaryCta: {
    backgroundColor: '#0E7490',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,

    // sombra (detalle pro)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  secondaryCtaText: {
    color: '#E9FEFF',
    fontWeight: '900',
    fontSize: 15,
  },
  mainCta: {
    backgroundColor: '#E9FEFF',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
  mainCtaText: {
    color: '#0A5B63',
    fontWeight: '900',
    fontSize: 16,
  },
  portfolioThumbWrap: {
    width: 120,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
  },
  portfolioThumb: {
    width: '100%',
    height: '100%',
  },

  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  previewModalCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 900 : undefined,
    backgroundColor: '#E9FEFF',
    borderRadius: 18,
    padding: 14,
  },
  previewModalImg: {
    width: '100%',
    height: 360,
    borderRadius: 14,
    backgroundColor: '#d9e6e7',
  },
  previewCloseBtn: {
    marginTop: 12,
    backgroundColor: '#0A5B63',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseBtnText: {
    color: '#E9FEFF',
    fontWeight: '900',
  },
});
