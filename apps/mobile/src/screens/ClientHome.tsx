//apps/mobile/src/screens/ClientHome.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import AppLogo from '../components/AppLogo';
import { ROOT_CATEGORIES, ROOT_CATEGORY_MAP, SUBCATEGORIES } from '../data/categories';
import { useSyncCustomerLocationOnMount } from '../hooks/useSyncCustomerLocationOnMount';
import { trackEvent } from '../lib/analytics';
import { useNotifications } from '../notifications/NotificationsProvider';

import type { HomeStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const IS_WEB = Platform.OS === 'web';

type SearchItem = {
  categoryId: keyof typeof SUBCATEGORIES;
  categoryName: string;
  subId: string;
  subTitle: string;
  searchText: string;
};

function normalizeSearchText(value: string) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const SEARCH_KEYWORDS: Record<string, string[]> = {
  plomeria: ['plomero', 'caños', 'canos', 'agua', 'griferia', 'grifería'],
  'plomeria-gasista': [
    'gas',
    'gasista',
    'instalacion de gas',
    'instalación de gas',
    'calefon',
    'calefón',
  ],
  climatizacion: ['aire', 'aire acondicionado', 'split', 'clima'],
  refrigeracion: ['heladera', 'freezer', 'refrigerador', 'frio', 'frío'],
  electricidad: ['electricista', 'luz', 'cortocircuito', 'cableado'],
  'reparacion-de-celulares': ['celular', 'telefono', 'teléfono', 'pantalla', 'iphone', 'android'],
  'servicio-tecnico-informatica': ['pc', 'computadora', 'notebook', 'laptop'],
  cerrajeria: ['cerradura', 'llave', 'puerta'],
  limpieza: ['limpiar', 'limpieza hogar', 'limpieza oficina'],
  lavanderia: ['lavado', 'ropa', 'lavarropa'],
  'clases-particulares': ['profesor', 'apoyo escolar', 'clases'],
  'paseador-de-perros': ['perro', 'paseo mascota'],
  'cuidado-de-mascotas': ['mascota', 'petsitter', 'cuidado animal'],
  abogado: ['legal', 'juicio', 'abogada'],
  contador: ['impuestos', 'afip', 'monotributo', 'contadora'],
  arquitecto: ['planos', 'obra', 'arquitectura'],
  ingeniero: ['ingenieria', 'ingeniería', 'calculo', 'cálculo'],
  peluqueria: ['peluquero', 'corte de pelo', 'cabello'],
  barberia: ['barbero', 'barba'],
  maquillaje: ['makeup', 'maquilladora'],
  depilacion: ['depilar', 'depiladora'],
  gomeria: ['goma', 'neumatico', 'neumático', 'cubierta'],
  'auxilio-vehicular': ['grua', 'grúa', 'remolque', 'auxilio auto'],
  fletes: ['mudanza', 'camion', 'camión', 'traslado muebles'],
  'mecanico-automotor': ['mecanico', 'mecánico', 'motor', 'auto'],
  'electricidad-del-automotor': ['electrico auto', 'eléctrico auto', 'bateria', 'batería'],
};

export default function ClientHome() {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { unread, webBannerVisible, webBannerCount, dismissWebBanner } = useNotifications();

  const auth = useAuth() as any;
  const isGuest = !auth?.user;
  const currentMode: 'client' | 'specialist' = auth?.mode ?? 'client';
  const canUseSpecialistMode = !!auth?.user?.profiles?.specialistId;
  const setAuthMode: ((mode: 'client' | 'specialist') => Promise<void>) | undefined = auth?.setMode;

  const [switchingMode, setSwitchingMode] = useState<'client' | 'specialist' | null>(null);
  const switchFade = useRef(new Animated.Value(0)).current;
  const switchScale = useRef(new Animated.Value(0.96)).current;

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!switchingMode) {
      switchFade.setValue(0);
      switchScale.setValue(0.96);
      return;
    }

    Animated.parallel([
      Animated.timing(switchFade, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(switchScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [switchingMode, switchFade, switchScale]);

  useSyncCustomerLocationOnMount();

  useEffect(() => {
    trackEvent({
      eventType: 'view_home',
      screen: 'ClientHome',
      metadata: {
        mode: 'client',
      },
    });
  }, []);

  const searchableServices = useMemo<SearchItem[]>(() => {
    return Object.entries(SUBCATEGORIES).flatMap(([categoryId, subs]) =>
      subs.map((sub) => {
        const keywords = SEARCH_KEYWORDS[sub.id] ?? [];
        const searchText = normalizeSearchText([sub.title, sub.id, ...keywords].join(' '));

        return {
          categoryId: categoryId as keyof typeof SUBCATEGORIES,
          categoryName: ROOT_CATEGORY_MAP[categoryId as keyof typeof SUBCATEGORIES].title,
          subId: sub.id,
          subTitle: sub.title,
          searchText,
        };
      }),
    );
  }, []);

  const searchResults = useMemo(() => {
    const q = normalizeSearchText(query);

    if (!q) return [];

    const scored = searchableServices
      .map((item) => {
        const title = normalizeSearchText(item.subTitle);
        const category = normalizeSearchText(item.categoryName);
        const slug = normalizeSearchText(item.subId);

        let score = 0;

        if (title === q) score += 100;
        if (title.startsWith(q)) score += 70;
        if (title.includes(q)) score += 40;

        if (slug.startsWith(q)) score += 55;
        if (slug.includes(q)) score += 25;

        if (category.includes(q)) score += 10;

        if (item.searchText.includes(q)) score += 20;

        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.subTitle.localeCompare(b.subTitle, 'es'))
      .slice(0, 6);

    return scored;
  }, [query, searchableServices]);

  const handleOpenNotifications = () => {
    dismissWebBanner();
    nav.navigate('Notifications' as never);
  };

  const handlePressSearchResult = (item: SearchItem) => {
    setQuery('');
    setSearchOpen(false);

    nav.navigate('SpecialistsList', {
      categorySlug: item.subId as any,
      title: item.subTitle,
    });
  };

  const performSwitchToSpecialistMode = async () => {
    try {
      setSwitchingMode('specialist');
      await new Promise((resolve) => setTimeout(resolve, 220));
      await setAuthMode?.('specialist');
    } catch (e) {
      if (__DEV__) console.log('[ClientHome] switch to specialist mode error', e);
      setSwitchingMode(null);

      if (Platform.OS === 'web') {
        window.alert('No pudimos cambiar de modo. Intentá nuevamente.');
      } else {
        Alert.alert('Ups', 'No pudimos cambiar de modo. Intentá nuevamente.');
      }
    }
  };

  const handleSwitchToSpecialistMode = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Vas a volver al modo especialista para gestionar tus trabajos, disponibilidad y perfil profesional.',
      );

      if (!confirmed) return;

      performSwitchToSpecialistMode().catch(() => undefined);
      return;
    }

    Alert.alert(
      'Cambiar a modo especialista',
      'Vas a volver al modo especialista para gestionar tus trabajos, disponibilidad y perfil profesional.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: () => {
            performSwitchToSpecialistMode().catch(() => undefined);
          },
        },
      ],
    );
  };

  const handleGuestLogin = () => {
    const rootNav = nav.getParent?.() as any;
    rootNav?.navigate?.('Login');
  };

  const handleGuestRegister = () => {
    const rootNav = nav.getParent?.() as any;
    rootNav?.navigate?.('ChooseRole');
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 10 }]}>
          <View style={styles.brandRow}>
            <AppLogo style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandText}>Solucity</Text>
          </View>

          {!isGuest && (
            <Pressable
              style={[styles.bellWrap, { top: insets.top + 6 }]}
              onPress={handleOpenNotifications}
              hitSlop={12}
              pressRetentionOffset={12}
            >
              <View style={styles.bellHitArea}>
                <Ionicons name="notifications-outline" size={28} color="#E9FEFF" />
                {unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        </View>

        {!isGuest && IS_WEB && webBannerVisible && (
          <View style={styles.bannerOuter}>
            <Pressable style={styles.banner} onPress={handleOpenNotifications}>
              <View style={styles.bannerLeft}>
                <Ionicons name="notifications" size={18} color="#015A69" />
                <Text style={styles.bannerText}>
                  {webBannerCount > 1
                    ? `Tenés ${webBannerCount} nuevas notificaciones`
                    : 'Tenés una nueva notificación'}
                </Text>
              </View>

              <View style={styles.bannerCloseBtnWrap}>
                <Pressable onPress={dismissWebBanner} hitSlop={10} style={styles.bannerCloseBtn}>
                  <Ionicons name="close" size={18} color="#015A69" />
                </Pressable>
              </View>
            </Pressable>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>¡Bienvenido!</Text>
          <Text style={styles.subtitle}>Elegí una categoría para empezar</Text>

          <View style={styles.searchSection}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#015A69" />
              <TextInput
                placeholder="Buscar servicio u oficio..."
                placeholderTextColor="#6b9ca3"
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                style={styles.searchInput}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {!!query && (
                <Pressable
                  onPress={() => {
                    setQuery('');
                    setSearchOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color="#6b9ca3" />
                </Pressable>
              )}
            </View>

            {searchOpen && query.trim().length > 0 && (
              <View style={styles.resultsBox}>
                {searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <Pressable
                      key={item.subId}
                      style={styles.resultItem}
                      onPress={() => handlePressSearchResult(item)}
                    >
                      <Text style={styles.resultTitle}>{item.subTitle}</Text>
                      <Text style={styles.resultCategory}>{item.categoryName}</Text>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.resultEmpty}>
                    <Text style={styles.resultEmptyText}>
                      No encontramos servicios con ese nombre.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {!isGuest && canUseSpecialistMode && currentMode === 'client' && (
            <View style={styles.modeSwitchWrap}>
              <Pressable style={styles.modeSwitchCard} onPress={handleSwitchToSpecialistMode}>
                <View style={styles.modeSwitchIconWrap}>
                  <Ionicons name="sparkles-outline" size={22} color="#0A5B63" />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.modeSwitchEyebrow}>Modo actual: Cliente</Text>
                  <Text style={styles.modeSwitchTitle}>Volver a modo especialista</Text>
                  <Text style={styles.modeSwitchText}>
                    Gestioná tus órdenes, tu perfil profesional y tu disponibilidad.
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={22} color="#0A5B63" />
              </Pressable>
            </View>
          )}

          <View style={styles.grid}>
            {ROOT_CATEGORIES.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  trackEvent({
                    eventType: 'view_category',
                    screen: 'ClientHome',
                    categorySlug: String(c.id),
                    metadata: {
                      categoryTitle: c.title,
                      source: 'client_home',
                    },
                  });

                  nav.navigate('Category', { id: c.id });
                }}
                style={({ pressed }) => [
                  styles.card,
                  pressed && { transform: [{ scale: 0.98 }], opacity: 0.98 },
                ]}
              >
                <View style={styles.iconWrap}>
                  {c.icon.set === 'ion' ? (
                    <Ionicons name={c.icon.name as any} size={36} color="#fff" />
                  ) : (
                    <MDI name={c.icon.name as any} size={36} color="#fff" />
                  )}
                </View>
                <Text style={styles.cardText}>{c.title}</Text>
              </Pressable>
            ))}
          </View>

          {isGuest && (
            <View style={styles.guestCtaWrap}>
              <Text style={styles.guestCtaTitle}>¿Querés continuar?</Text>
              <Text style={styles.guestCtaText}>
                Podés explorar servicios libremente. Para contratar o ofrecer tus servicios en
                Solucity, iniciá sesión o creá una cuenta.
              </Text>

              <View style={styles.guestButtonsRow}>
                <Pressable
                  onPress={handleGuestRegister}
                  style={({ pressed }) => [styles.guestPrimaryBtn, pressed && { opacity: 0.95 }]}
                >
                  <Text style={styles.guestPrimaryText}>Crear cuenta</Text>
                </Pressable>

                <Pressable
                  onPress={handleGuestLogin}
                  style={({ pressed }) => [styles.guestSecondaryBtn, pressed && { opacity: 0.92 }]}
                >
                  <Text style={styles.guestSecondaryText}>Iniciar sesión</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {switchingMode && (
        <View style={styles.switchOverlay}>
          <Animated.View
            style={[
              styles.switchCard,
              {
                opacity: switchFade,
                transform: [{ scale: switchScale }],
              },
            ]}
          >
            <View style={styles.switchIconWrap}>
              <Ionicons name="sparkles-outline" size={28} color="#0A5B63" />
            </View>

            <Text style={styles.switchTitle}>
              {switchingMode === 'specialist'
                ? 'Cambiando a modo especialista'
                : 'Cambiando a modo cliente'}
            </Text>

            <Text style={styles.switchSubtitle}>Estamos preparando tu experiencia.</Text>
          </Animated.View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 30, height: 30 },
  brandText: { color: '#E9FEFF', fontWeight: '900', fontSize: 26, letterSpacing: 0.5 },

  bellWrap: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
  },
  bellHitArea: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#ff3b30',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  bannerOuter: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  banner: {
    backgroundColor: '#E9FEFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    paddingRight: 8,
  },
  bannerText: {
    color: '#015A69',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  bannerCloseBtn: {
    marginLeft: 8,
    padding: 2,
  },
  bannerCloseBtnWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { color: 'rgba(233,254,255,0.9)', marginTop: 6, marginBottom: 16 },

  searchSection: {
    marginBottom: 14,
    position: 'relative',
    zIndex: 10,
  },

  searchBox: {
    backgroundColor: '#E9FEFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  searchInput: {
    flex: 1,
    color: '#015A69',
    fontWeight: '700',
    paddingVertical: 0,
  },

  resultsBox: {
    marginTop: 8,
    backgroundColor: '#E9FEFF',
    borderRadius: 16,
    overflow: 'hidden',
  },

  resultItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1,90,105,0.08)',
  },

  resultTitle: {
    color: '#015A69',
    fontWeight: '800',
    fontSize: 14,
  },

  resultCategory: {
    color: '#4A6C70',
    fontSize: 12,
    marginTop: 2,
  },

  resultEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  resultEmptyText: {
    color: '#4A6C70',
    fontWeight: '700',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: '4%',
    rowGap: 14,
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    height: 120,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: { marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  cardText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
  },

  modeSwitchWrap: {
    marginTop: 4,
    marginBottom: 14,
  },

  modeSwitchCard: {
    backgroundColor: '#E9FEFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
  },

  modeSwitchIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(10,91,99,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modeSwitchEyebrow: {
    color: '#0A5B63',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },

  modeSwitchTitle: {
    color: '#0A5B63',
    fontSize: 16,
    fontWeight: '900',
  },

  modeSwitchText: {
    color: '#4A6C70',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 35, 40, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  switchCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#E9FEFF',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
  },

  switchIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(10,91,99,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  switchTitle: {
    color: '#0A5B63',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  switchSubtitle: {
    color: '#4A6C70',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  guestCtaWrap: {
    marginTop: 22,
    marginBottom: 8,
    padding: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(233,254,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.28)',
  },

  guestCtaTitle: {
    color: '#E9FEFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  guestCtaText: {
    color: 'rgba(233,254,255,0.92)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },

  guestButtonsRow: {
    marginTop: 14,
    gap: 10,
  },

  guestPrimaryBtn: {
    height: 46,
    borderRadius: 16,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  guestPrimaryText: {
    color: '#0A5B63',
    fontWeight: '900',
    fontSize: 15,
  },

  guestSecondaryBtn: {
    height: 46,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(233,254,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,35,40,0.14)',
  },

  guestSecondaryText: {
    color: '#E9FEFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
