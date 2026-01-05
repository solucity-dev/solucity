import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROOT_CATEGORIES } from '../data/categories';
import { useSyncCustomerLocationOnMount } from '../hooks/useSyncCustomerLocationOnMount';
import { useNotifications } from '../notifications/NotificationsProvider';
import type { CategorySlug, HomeStackParamList } from '../types';

// ➕ IMPORTAMOS EL HOOK

export default function ClientHome() {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { unread } = useNotifications();

  // ➕ ACTIVAMOS LA SINCRONIZACIÓN DE UBICACIÓN
  useSyncCustomerLocationOnMount();

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>solucity</Text>
          </View>

          <Pressable
            style={[styles.bellWrap, { top: insets.top + 12 }]}
            onPress={() => nav.navigate('Notifications' as never)}
          >
            <Ionicons name="notifications-outline" size={28} color="#E9FEFF" />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>¡Bienvenido!</Text>
          <Text style={styles.subtitle}>Elegí una categoría para empezar</Text>

          <View style={styles.grid}>
            {ROOT_CATEGORIES.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => nav.navigate('Category', { id: c.id as CategorySlug })}
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

  bellWrap: { position: 'absolute', right: 18 },
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
});
