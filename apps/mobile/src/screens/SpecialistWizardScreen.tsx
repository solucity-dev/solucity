// apps/mobile/src/screens/SpecialistWizardScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../lib/api';

import type { HomeStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<HomeStackParamList>;

type Category = { id: string; name: string; slug: string };

// Puedes reemplazar esta lista con un GET real si ya tenés endpoint de categorías.
const FALLBACK_CATEGORIES: Category[] = [
  { id: 'albanileria', name: 'Albañilería', slug: 'albanileria' },
  { id: 'plomeria', name: 'Plomería', slug: 'plomeria' },
  { id: 'electricidad', name: 'Electricidad', slug: 'electricidad' },
  { id: 'pintura', name: 'Pintura', slug: 'pintura' },
  { id: 'jardineria', name: 'Jardinería', slug: 'jardineria' },
];

export default function SpecialistWizardScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [categories, setCategories] = useState<Category[]>(FALLBACK_CATEGORIES);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [visitPrice, setVisitPrice] = useState<string>('0');
  const [availableNow, setAvailableNow] = useState<boolean>(true);

  const [center, setCenter] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
  const [radiusKm, setRadiusKm] = useState<string>('8');

  const [loading, setLoading] = useState(false);

  const canNext = useMemo(() => {
    if (step === 1) return !!categoryId;
    if (step === 2) return Number.isFinite(Number(visitPrice));
    if (step === 3)
      return (
        Number.isFinite(Number(center.lat)) &&
        Number.isFinite(Number(center.lng)) &&
        Number.isFinite(Number(radiusKm))
      );
    return false;
  }, [step, categoryId, visitPrice, center, radiusKm]);

  const next = async () => {
    if (!canNext) return;
    if (step < 3) setStep((s) => (s + 1) as any);
    else await onFinish();
  };

  const onFinish = async () => {
    try {
      setLoading(true);
      // 1) bootstrap
      await api.post('/specialists/me/bootstrap');

      // 2) specialties (principal)
      await api.put('/specialists/me/specialties', {
        primaryCategoryId: categoryId,
      });

      // 3) profile
      await api.put('/specialists/me/profile', {
        visitPrice: Number(visitPrice) || null,
        availableNow: !!availableNow,
        centerLat: Number(center.lat),
        centerLng: Number(center.lng),
        radiusKm: Number(radiusKm) || 8,
      });

      Alert.alert('Listo', 'Perfil de especialista configurado.');
      nav.goBack();
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'No se pudo guardar';
      Alert.alert('Error', String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => nav.goBack()} style={{ padding: 6, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.brand}>Configurar especialista</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>Paso {step} de 3</Text>
          </View>

          {step === 1 && (
            <View>
              <Text style={styles.title}>Elegí tu rubro principal</Text>
              <View style={{ marginTop: 10, gap: 10 }}>
                {categories.map((c) => {
                  const on = c.id === categoryId;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategoryId(c.id)}
                      style={[styles.item, on && styles.itemOn]}
                    >
                      <Text style={[styles.itemText, on && styles.itemTextOn]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.title}>Datos básicos</Text>

              <Text style={styles.label}>Precio visita técnica (opcional)</Text>
              <TextInput
                keyboardType="numeric"
                value={visitPrice}
                onChangeText={setVisitPrice}
                placeholder="0"
                placeholderTextColor="#7fa5a9"
                style={styles.input}
              />

              <Pressable
                onPress={() => setAvailableNow((v) => !v)}
                style={[styles.switch, availableNow && styles.switchOn]}
              >
                <Text style={[styles.switchText, availableNow && styles.switchTextOn]}>
                  {availableNow ? 'Disponible ahora' : 'No disponible'}
                </Text>
              </Pressable>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.title}>Cobertura</Text>

              <Text style={styles.label}>Centro (lat, lng)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={center.lat}
                  onChangeText={(v) => setCenter((s) => ({ ...s, lat: v }))}
                  placeholder="-31.4"
                  placeholderTextColor="#7fa5a9"
                  style={[styles.input, { flex: 1 }]}
                  keyboardType="numeric"
                />
                <TextInput
                  value={center.lng}
                  onChangeText={(v) => setCenter((s) => ({ ...s, lng: v }))}
                  placeholder="-64.18"
                  placeholderTextColor="#7fa5a9"
                  style={[styles.input, { flex: 1 }]}
                  keyboardType="numeric"
                />
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>Radio (km)</Text>
              <TextInput
                value={radiusKm}
                onChangeText={setRadiusKm}
                placeholder="8"
                placeholderTextColor="#7fa5a9"
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
          )}
        </ScrollView>

        {/* CTA */}
        <View style={styles.ctaBar}>
          <Pressable
            disabled={!canNext || loading}
            onPress={next}
            style={[styles.btn, (!canNext || loading) && { opacity: 0.7 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>{step < 3 ? 'Siguiente' : 'Finalizar'}</Text>
            )}
          </Pressable>
        </View>
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
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(233,254,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  stepText: { color: '#E9FEFF', fontWeight: '800' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 8, marginBottom: 12 },
  label: { color: '#E9FEFF', fontWeight: '800', marginTop: 10, marginBottom: 6 },
  item: {
    backgroundColor: 'rgba(233,254,255,0.18)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemOn: { backgroundColor: '#E9FEFF' },
  itemText: { color: '#E9FEFF', fontWeight: '800' },
  itemTextOn: { color: '#06494F' },
  input: {
    backgroundColor: '#E9FEFF',
    color: '#06494F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switch: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  switchOn: { backgroundColor: '#E9FEFF' },
  switchText: { color: '#E9FEFF', fontWeight: '800' },
  switchTextOn: { color: '#06494F' },
  ctaBar: { padding: 16 },
  btn: {
    backgroundColor: '#ff8a00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
