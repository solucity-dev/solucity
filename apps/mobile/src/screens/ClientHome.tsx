//apps/mobile/src/screens/ClientHome.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import AppLogo from '../components/AppLogo';
import { ROOT_CATEGORIES } from '../data/categories';
import { useSyncCustomerLocationOnMount } from '../hooks/useSyncCustomerLocationOnMount';
import { useNotifications } from '../notifications/NotificationsProvider';

import type { HomeStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const IS_WEB = Platform.OS === 'web';

export default function ClientHome() {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { unread, webBannerVisible, webBannerCount, dismissWebBanner } = useNotifications();

  const auth = useAuth() as any;
  const currentMode: 'client' | 'specialist' = auth?.mode ?? 'client';
  const canUseSpecialistMode = !!auth?.user?.profiles?.specialistId;
  const setAuthMode: ((mode: 'client' | 'specialist') => Promise<void>) | undefined = auth?.setMode;

  const [switchingMode, setSwitchingMode] = useState<'client' | 'specialist' | null>(null);
  const switchFade = useRef(new Animated.Value(0)).current;
  const switchScale = useRef(new Animated.Value(0.96)).current;

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

  const handleOpenNotifications = () => {
    dismissWebBanner();
    nav.navigate('Notifications' as never);
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

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 10 }]}>
          <View style={styles.brandRow}>
            <AppLogo style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandText}>Solucity</Text>
          </View>

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
        </View>

        {IS_WEB && webBannerVisible && (
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

          {canUseSpecialistMode && currentMode === 'client' && (
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
                onPress={() => nav.navigate('Category', { id: c.id })}
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
});
