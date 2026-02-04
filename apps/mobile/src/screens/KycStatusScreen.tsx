//KycStatusSCreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../lib/api';

type KycStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

type SpecialistMeResponse = {
  ok?: boolean;
  profile?: {
    kycStatus?: KycStatus;
    // si agregás lastKyc en backend:
    kyc?: {
      status: KycStatus;
      rejectionReason?: string | null;
      createdAt?: string | null;
      reviewedAt?: string | null;
    } | null;
  };
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function badgeFor(status: KycStatus) {
  switch (status) {
    case 'VERIFIED':
      return { label: 'Verificado', icon: 'checkmark-circle', color: '#8EF0CF' as const };
    case 'PENDING':
      return { label: 'En revisión', icon: 'time', color: '#FFE8A3' as const };
    case 'REJECTED':
      return { label: 'Rechazado', icon: 'close-circle', color: '#FFC7CD' as const };
    default:
      return { label: 'Sin verificar', icon: 'alert-circle', color: '#B5DADD' as const };
  }
}

export default function KycStatusScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<KycStatus>('UNVERIFIED');
  const [reason, setReason] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<SpecialistMeResponse>('/specialists/me', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      const p = data?.profile ?? (data as any);
      const kycStatus: KycStatus = p?.kycStatus ?? 'UNVERIFIED';
      setStatus(kycStatus);

      // si backend manda kyc (último envío)
      const last = p?.kyc ?? null;
      setReason(last?.rejectionReason ?? null);
      setCreatedAt(last?.createdAt ?? null);
      setReviewedAt(last?.reviewedAt ?? null);
    } catch (e: any) {
      if (__DEV__) console.log('[KycStatusScreen] error', e?.response?.data ?? e);
      Alert.alert('Ups', 'No pudimos cargar tu verificación.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const badge = badgeFor(status);

  const goToUpload = () => {
    nav.navigate('KycUpload');
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top + 6 }}>
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Verificación (KYC)</Text>
          <View style={{ width: 34 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E9FEFF" />
            <Text style={styles.muted}>Cargando estado…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 30 + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.badgeRow}>
                <Ionicons name={badge.icon as any} size={22} color={badge.color} />
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>

              {status === 'VERIFIED' ? (
                <Text style={styles.text}>
                  Tu identidad ya fue verificada. Estás habilitado para operar normalmente.
                </Text>
              ) : status === 'PENDING' ? (
                <Text style={styles.text}>
                  Estamos revisando tu documentación. Esto puede demorar un poco.
                </Text>
              ) : status === 'REJECTED' ? (
                <>
                  <Text style={styles.text}>
                    Tu verificación fue rechazada. Podés reenviar la documentación.
                  </Text>
                  {reason ? (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonTitle}>Motivo</Text>
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.text}>
                  Aún no enviaste tu verificación. Para aparecer en búsquedas y operar sin límites,
                  completá el KYC.
                </Text>
              )}

              <View style={{ marginTop: 10 }}>
                {!!createdAt && <Text style={styles.muted}>Enviado: {formatDate(createdAt)}</Text>}
                {!!reviewedAt && (
                  <Text style={styles.muted}>Revisado: {formatDate(reviewedAt)}</Text>
                )}
              </View>

              {status !== 'VERIFIED' ? (
                <Pressable style={styles.btn} onPress={goToUpload}>
                  <Text style={styles.btnT}>
                    {status === 'PENDING'
                      ? 'Ver pantalla de envío'
                      : 'Enviar / Reenviar verificación'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#E9FEFF', fontSize: 20, fontWeight: '800', textAlign: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: '#9ec9cd' },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 18,
    padding: 16,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badgeText: { color: '#E9FEFF', fontWeight: '900', fontSize: 16 },

  text: { color: '#E9FEFF', fontSize: 14, lineHeight: 20 },

  reasonBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  reasonTitle: { color: '#E9FEFF', fontWeight: '800', marginBottom: 6 },
  reasonText: { color: '#E9FEFF' },

  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  btnT: { color: '#0A5B63', fontWeight: '900' },
});
