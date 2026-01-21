// apps/mobile/src/screens/BackgroundCheckScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type BackgroundCheck = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  fileUrl?: string | null;
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusMeta(status?: BackgroundCheck['status'] | null) {
  switch (status) {
    case 'APPROVED':
      return {
        label: 'Aprobado ✅',
        icon: 'checkmark-circle-outline' as const,
        chipBg: 'rgba(0,160,120,0.18)',
        chipTxt: '#8EF0CF',
        hint: 'Tus antecedentes están aprobados. Ya podés mantener tu disponibilidad habilitada.',
      };
    case 'PENDING':
      return {
        label: 'En revisión',
        icon: 'time-outline' as const,
        chipBg: 'rgba(240,200,60,0.18)',
        chipTxt: '#FFE8A3',
        hint: 'Estamos revisando tu documento. Te avisaremos cuando haya una decisión.',
      };
    case 'REJECTED':
      return {
        label: 'Rechazado',
        icon: 'close-circle-outline' as const,
        chipBg: 'rgba(240,50,60,0.18)',
        chipTxt: '#FFC7CD',
        hint: 'Tu documento fue rechazado. Podés subir uno nuevo para que lo revisemos otra vez.',
      };
    default:
      return {
        label: 'No cargado',
        icon: 'document-text-outline' as const,
        chipBg: 'rgba(255,255,255,0.10)',
        chipTxt: '#E9FEFF',
        hint: 'Subí tu certificado de antecedentes penales para que podamos aprobar tu perfil.',
      };
  }
}

export default function BackgroundCheckScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [backgroundCheck, setBackgroundCheck] = useState<BackgroundCheck | null>(null);

  const meta = useMemo(
    () => statusMeta(backgroundCheck?.status ?? null),
    [backgroundCheck?.status],
  );

  /** 1️⃣ Cargar estado actual */
  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/specialists/me', { headers: { 'Cache-Control': 'no-cache' } });
      const profile = res.data?.profile;
      setBackgroundCheck(profile?.backgroundCheck ?? null);
    } catch (e) {
      if (__DEV__) console.log('[BackgroundCheck] loadStatus error', e);
      Alert.alert('Error', 'No se pudo cargar el estado');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /** 2️⃣ Subir archivo */
  const handleUpload = useCallback(async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (pick.canceled) return;

      setUploading(true);

      const file = pick.assets[0];

      // ✅ ANDROID FIX: DocumentPicker a veces devuelve content:// y FormData/axios falla intermitente
      // Lo copiamos a cache y usamos file://
      let uploadUri = file.uri;

      if (uploadUri.startsWith('content://')) {
        const ext =
          (file.name?.includes('.') ? file.name.split('.').pop() : null) ||
          (file.mimeType === 'application/pdf' ? 'pdf' : 'jpg');

        const baseDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
        if (!baseDir) throw new Error('no_cache_dir');

        const target = `${baseDir}bg_${Date.now()}.${ext}`;

        await FileSystem.copyAsync({ from: uploadUri, to: target });
        uploadUri = target;
      }

      // Logs útiles
      if (__DEV__) console.log('[BackgroundCheck] uri =', uploadUri);

      // Tamaño (si no lo soporta el runtime, cae a 0 y no corta)
      const info: any = await FileSystem.getInfoAsync(uploadUri);
      const sizeBytes = typeof info?.size === 'number' ? info.size : 0;
      const sizeMb = sizeBytes / (1024 * 1024);
      if (__DEV__) console.log('[BackgroundCheck] sizeMB =', sizeMb.toFixed(2));

      // (Opcional) corte por peso
      if (sizeMb > 12) {
        Alert.alert(
          'Archivo muy pesado',
          `El archivo pesa ${sizeMb.toFixed(1)} MB. Probá con uno más liviano (ideal < 10–12 MB).`,
        );
        return;
      }

      const form = new FormData();

      const fallbackType =
        file.mimeType ??
        (uploadUri.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      form.append('file', {
        uri: uploadUri,
        name: file.name ?? `antecedente_${Date.now()}`,
        type: fallbackType,
      } as any);

      // 2.a subir archivo (axios)
      const uploadRes = await api.post('/specialists/background-check/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000, // si Render está lento, evitamos cortar muy rápido
      });

      const url = uploadRes.data?.url;
      if (!url) throw new Error('upload_failed_no_url');

      // 2.b guardar antecedente
      await api.post('/specialists/background-check', { fileUrl: url });

      Alert.alert('Listo', 'Antecedente enviado para revisión');
      await loadStatus();
    } catch (e: any) {
      // Si es axios:
      const isAxios = !!e?.isAxiosError;
      if (__DEV__) {
        console.log(
          '[BackgroundCheck] handleUpload error',
          isAxios ? (e?.response?.data ?? e?.message) : e,
        );
      }

      const msg =
        e?.response?.data?.error ||
        e?.message ||
        'Error al subir archivo. Verificá tu conexión e intentá nuevamente.';
      Alert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  }, [loadStatus]);

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center} edges={['top']}>
          <ActivityIndicator color="#E9FEFF" />
          <Text style={styles.centerText}>Cargando antecedentes…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top + 6 }} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#E9FEFF" />
            <Text style={styles.headerTitle}>Antecedentes penales</Text>
          </View>

          <Pressable
            onPress={loadStatus}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="refresh" size={20} color="#E9FEFF" />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom + 70 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Estado</Text>

              <View style={[styles.chip, { backgroundColor: meta.chipBg }]}>
                <Ionicons name={meta.icon} size={16} color={meta.chipTxt} />
                <Text style={[styles.chipText, { color: meta.chipTxt }]}>{meta.label}</Text>
              </View>
            </View>

            <Text style={styles.muted}>{meta.hint}</Text>

            {backgroundCheck?.reviewedAt ? (
              <Text style={[styles.muted, { marginTop: 10 }]}>
                Revisado:{' '}
                <Text style={styles.mutedStrong}>{formatDate(backgroundCheck.reviewedAt)}</Text>
              </Text>
            ) : null}

            {backgroundCheck?.status === 'REJECTED' ? (
              <View style={styles.rejectBox}>
                <Text style={styles.rejectTitle}>Motivo del rechazo</Text>
                <Text style={styles.rejectText}>
                  {backgroundCheck.rejectionReason?.trim() || 'No especificado'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={18} color="#E9FEFF" />
              <Text style={styles.sectionTitle}>Subir documento</Text>
            </View>

            <Text style={styles.muted}>
              Aceptamos <Text style={styles.mutedStrong}>PDF</Text> o{' '}
              <Text style={styles.mutedStrong}>imagen</Text>. Asegurate de que se vea completo,
              legible y sin recortes.
            </Text>

            <View style={{ marginTop: 14 }}>
              <Pressable
                onPress={handleUpload}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  uploading && { opacity: 0.7 },
                  pressed && !uploading && { transform: [{ scale: 0.99 }] },
                ]}
              >
                {uploading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color="#0A5B63" />
                    <Text style={styles.primaryBtnText}>Subiendo…</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#0A5B63" />
                    <Text style={styles.primaryBtnText}>
                      {backgroundCheck ? 'Actualizar antecedente' : 'Subir antecedente'}
                    </Text>
                  </View>
                )}
              </Pressable>

              <Text style={[styles.muted, { marginTop: 10 }]}>
                Al subir un nuevo archivo, el estado vuelve a{' '}
                <Text style={styles.mutedStrong}>En revisión</Text>.
              </Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: 'rgba(3, 55, 63, 0.85)' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="lock-closed-outline" size={18} color="#E9FEFF" />
              <Text style={styles.sectionTitle}>Privacidad</Text>
            </View>
            <Text style={styles.muted}>
              Este documento se usa solo para validar tu perfil como especialista. No se comparte
              con clientes.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  centerText: { color: '#E9FEFF', marginTop: 10, fontWeight: '800' },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerTitle: { color: '#E9FEFF', fontSize: 18, fontWeight: '900' },

  iconBtn: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
  },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.28)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: { color: '#E9FEFF', fontWeight: '900', fontSize: 16 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontWeight: '900', fontSize: 12 },

  muted: { color: '#9ec9cd', marginTop: 10, lineHeight: 18 },
  mutedStrong: { color: '#E9FEFF', fontWeight: '900' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { color: '#E9FEFF', fontWeight: '900', fontSize: 15 },

  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#0A5B63', fontWeight: '900', fontSize: 15 },

  rejectBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,50,60,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(240,50,60,0.25)',
  },
  rejectTitle: { color: '#FFC7CD', fontWeight: '900' },
  rejectText: { color: '#FFC7CD', marginTop: 6, lineHeight: 18 },
});
