// apps/mobile/src/screens/CategoryScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROOT_CATEGORY_MAP, SUBCATEGORIES } from '../data/categories';

import type { CategorySlug, HomeStackParamList, RootCategoryId } from '../types';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type SubcatItem = {
  id: string;
  title: string;
  icon: { set: 'ion' | 'mdi'; name: string };
};

export default function CategoryScreen() {
  const { params } = useRoute<RouteProp<HomeStackParamList, 'Category'>>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  // ✅ Este screen debe recibir SIEMPRE un RootCategoryId
  const rootId = params.id as RootCategoryId;

  const cat = ROOT_CATEGORY_MAP[rootId];
  const rubros = (SUBCATEGORIES[rootId] || []) as SubcatItem[];

  // 🔒 Fallback seguro si llega algo inesperado
  if (!cat) {
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

          <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>
              Categoría no encontrada
            </Text>
            <Text style={{ color: 'rgba(233,254,255,0.9)', marginTop: 8 }}>
              Recibí: {String(params?.id)}
            </Text>

            <Pressable
              onPress={() => nav.goBack()}
              style={[styles.card, { marginTop: 18, width: '100%' }]}
            >
              <Text style={styles.cardText}>Volver</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
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
            <Text style={styles.brandText}>Solucity</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Título */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {cat.icon.set === 'ion' ? (
              <Ionicons name={cat.icon.name as any} size={22} color="#E9FEFF" />
            ) : (
              <MDI name={cat.icon.name as any} size={22} color="#E9FEFF" />
            )}
            <Text style={styles.title}>{cat.title}</Text>
          </View>
          <Text style={styles.subtitle}>Elegí un rubro</Text>

          {/* Grid de rubros */}
          <View style={styles.grid}>
            {rubros.map((r: SubcatItem) => (
              <Pressable
                key={r.id}
                onPress={() =>
                  nav.navigate('SpecialistsList', {
                    categorySlug: r.id as CategorySlug,
                    title: r.title,
                  })
                }
                style={({ pressed }) => [
                  styles.card,
                  pressed && { transform: [{ scale: 0.98 }], opacity: 0.98 },
                ]}
              >
                <View style={styles.iconWrap}>
                  {r.icon.set === 'ion' ? (
                    <Ionicons name={r.icon.name as any} size={32} color="#fff" />
                  ) : (
                    <MDI name={r.icon.name as any} size={32} color="#fff" />
                  )}
                </View>
                <Text style={styles.cardText}>{r.title}</Text>
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
    paddingTop: 4,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 26, height: 26 },
  brandText: { color: '#E9FEFF', fontWeight: '800', fontSize: 22, letterSpacing: 0.5 },

  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 6 },
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
    height: 110,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: { marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  cardText: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center', lineHeight: 18 },
});
