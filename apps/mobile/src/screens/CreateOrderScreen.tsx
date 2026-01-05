// apps/mobile/src/screens/CreateOrderScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

type RouteT = RouteProp<HomeStackParamList, 'CreateOrder'>;

type MeResponse = {
  ok: boolean;
  user: {
    id: string;
    role: 'CUSTOMER' | 'SPECIALIST' | 'ADMIN';
    email?: string | null;
  };
  profiles: { customerId: string | null; specialistId: string | null };
  defaultAddress?: { id: string; formatted: string } | null;
};

type PhotoItem = {
  localUri: string;
  remoteUrl?: string | null;
};

export default function CreateOrderScreen() {
  const insets = useSafeAreaInsets();
  const rawTabH = useBottomTabBarHeight();
  // 🔴 A VECES rawTabH = 0 → el botón queda debajo de la tab bar
  // ✅ Altura efectiva con mínimo razonable (ajustable si tu tab es más alta)
  const tabH = Math.max(rawTabH, 60);

  const { params } = useRoute<RouteT>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  // Me (para obtener customerId y defaultAddressId)
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMeLoading(true);
        setMeError(null);
        const r = await api.get<MeResponse>('/auth/me', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (mounted) setMe(r.data);
      } catch (e: any) {
        if (mounted) setMeError(e?.message ?? 'No se pudo obtener usuario');
      } finally {
        if (mounted) setMeLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Form state
  const [address, setAddress] = useState((params as any).address ?? '');
  useEffect(() => {
    if (!(params as any).address && me?.defaultAddress?.formatted) {
      setAddress(me.defaultAddress.formatted);
    }
  }, [me?.defaultAddress?.formatted, (params as any).address]);

  const [desc, setDesc] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [mode, setMode] = useState<'now' | 'schedule'>('now');

  // fecha/hora nativas
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const visitInfo = useMemo(() => {
    const p = (params as any).visitPrice;
    return p != null
      ? `Visita técnica: $${p.toLocaleString('es-AR')}`
      : 'Visita técnica: a consultar';
  }, [(params as any).visitPrice]);

  const toggleChip = (label: string) =>
    setChips((cur) => (cur.includes(label) ? cur.filter((c) => c !== label) : [...cur, label]));

  function formatDate(d: Date) {
    return d.toLocaleDateString();
  }
  function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Subida de imágenes
  const uploadOrderImage = async (localUri: string): Promise<string> => {
    const form = new FormData();
    form.append('file', {
      uri: localUri,
      name: 'order-attachment.jpg',
      type: 'image/jpeg',
    } as any);

    const r = await api.post<{ url: string }>('/orders/attachments/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return r.data.url;
  };

  const handleAddPhotoFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos para adjuntarlas.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        const assets = result.assets ?? [];
        setPhotos((prev) => {
          const next = [...prev];
          for (const asset of assets) {
            if (!asset.uri) continue;
            next.push({ localUri: asset.uri, remoteUrl: null });
          }
          return next.slice(0, 6);
        });
      }
    } catch (e) {
      console.warn('[CreateOrder] handleAddPhotoFromLibrary error', e);
    }
  };

  const handleAddPhotoFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para tomar una foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setPhotos((prev) => [...prev, { localUri: uri, remoteUrl: null }].slice(0, 6));
      }
    } catch (e) {
      console.warn('[CreateOrder] handleAddPhotoFromCamera error', e);
    }
  };

  const pickImages = () => {
    Alert.alert('Agregar fotos', 'Elegí cómo querés adjuntar la imagen', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tomar foto', onPress: handleAddPhotoFromCamera },
      { text: 'Elegir de la galería', onPress: handleAddPhotoFromLibrary },
    ]);
  };

  const onConfirm = async () => {
    try {
      const typedFormatted = address.trim();
      if (!typedFormatted) {
        Alert.alert('Falta la dirección', 'Indicá dónde realizar el trabajo.');
        return;
      }

      if (mode === 'schedule' && !scheduledAt) {
        Alert.alert('Faltan datos', 'Indicá fecha y hora o elegí “Ahora”.');
        return;
      }

      if (!me?.ok) {
        Alert.alert('Sesión requerida', 'No pudimos identificar al usuario (auth/me).');
        return;
      }
      const customerId = me?.profiles?.customerId;
      if (!customerId) {
        Alert.alert('Sesión requerida', 'No pudimos identificar el perfil de cliente (auth/me).');
        return;
      }

      // serviceId
      let serviceId: string | undefined = (params as any).serviceId;
      if (!serviceId && (params as any).specialistId) {
        try {
          const spec = await api.get(`/specialists/${(params as any).specialistId}`);
          serviceId =
            spec.data?.defaultServiceId || spec.data?.serviceId || spec.data?.services?.[0]?.id;
        } catch (e) {
          console.warn('[CreateOrder] no se pudo inferir serviceId desde specialist', e);
        }
      }
      if (!serviceId) {
        Alert.alert(
          'Falta elegir servicio',
          'No pudimos determinar el servicio. Volvé al perfil y elegí uno, o enviá serviceId al navegar.',
        );
        return;
      }

      // locationId SOLO si corresponde
      const defaultFormatted = me?.defaultAddress?.formatted?.trim() ?? '';
      const explicitLocationId = (params as any).locationId as string | undefined;

      const hasManualAddress = typedFormatted.length > 0 && typedFormatted !== defaultFormatted;

      const shouldSendLocationId =
        !!explicitLocationId || (!hasManualAddress && typedFormatted === defaultFormatted);

      const locationIdToSend =
        explicitLocationId ?? (shouldSendLocationId ? me?.defaultAddress?.id : null);

      setSubmitting(true);

      // subir fotos
      const photosWithRemote = await Promise.all(
        photos.map(async (p) => {
          if (p.remoteUrl) return p;
          const url = await uploadOrderImage(p.localUri);
          return { ...p, remoteUrl: url };
        }),
      );

      const attachments = photosWithRemote
        .filter((p) => !!p.remoteUrl)
        .map((p) => ({ type: 'image', url: p.remoteUrl }));

      const description = [desc.trim(), ...chips].filter(Boolean).join(' · ');

      // ✅ payload SIN null en fechas
      const payload: any = {
        customerId,
        specialistId: (params as any).specialistId,
        serviceId,
        description: description || null,
        attachments,
        isUrgent: urgent || mode === 'now',
        ...(locationIdToSend ? { locationId: locationIdToSend } : {}),
        address: typedFormatted || null,
      };

      if (mode === 'now') {
        payload.preferredAt = new Date().toISOString();
      }

      if (mode === 'schedule' && scheduledAt) {
        payload.scheduledAt = scheduledAt.toISOString();
      }

      if (__DEV__) {
        console.log('[CreateOrder] payload =>', JSON.stringify(payload, null, 2));
      }

      const r = await api.post('/orders', payload, {
        headers: { 'x-user-id': me?.user.id ?? '' },
      });

      Alert.alert(
        '¡Pedido enviado!',
        `Tu solicitud fue creada para ${(params as any).specialistName ?? 'el especialista'}.`,
      );

      nav.goBack();
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      console.log('[CreateOrder] error status =', status);
      console.log('[CreateOrder] error data =', data);

      const msg =
        data?.error?.message ||
        data?.error ||
        (status === 401
          ? 'Sesión expirada. Volvé a iniciar sesión.'
          : 'No se pudo crear la orden.');

      Alert.alert('Error', String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => nav.goBack()} style={{ padding: 6, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source={require('../assets/logo.png')} style={{ width: 22, height: 22 }} />
            <Text style={styles.brand}>Solucity</Text>
          </View>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: tabH + (insets.bottom || 0) + 140,
          }}
        >
          <Text style={styles.title}>Confirmar pedido</Text>

          {meLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ActivityIndicator color="#E9FEFF" />
              <Text style={{ color: '#E9FEFF' }}>Cargando perfil…</Text>
            </View>
          ) : meError ? (
            <Text style={{ color: '#FFECEC', marginBottom: 8 }}>
              No se pudo obtener el perfil: {meError}
            </Text>
          ) : null}

          {/* Dirección */}
          <Text style={styles.label}>Dirección</Text>
          <View style={styles.inputRow}>
            <MDI name="map-marker-outline" size={18} color="#06494F" />
            <TextInput
              placeholder="Veracruz 123, Córdoba"
              placeholderTextColor="#7fa5a9"
              value={address}
              onChangeText={setAddress}
              style={styles.input}
              autoCapitalize="words"
            />
            <Pressable style={styles.linkBtn} onPress={() => {}}>
              <Text style={styles.linkText}>EDITAR</Text>
            </Pressable>
          </View>

          {/* Descripción */}
          <Text style={[styles.label, { marginTop: 12 }]}>Descripción del problema</Text>

          <View style={styles.chipsRow}>
            {['Corte de luz', 'Cortocircuito', 'Presupuesto', 'Sin encendido'].map((c) => {
              const on = chips.includes(c);
              return (
                <Pressable
                  key={c}
                  onPress={() => toggleChip(c)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            multiline
            numberOfLines={4}
            placeholder="Escribí una descripción"
            placeholderTextColor="#7fa5a9"
            style={styles.textarea}
            value={desc}
            onChangeText={setDesc}
          />

          {/* Fotos */}
          <Pressable onPress={pickImages} style={styles.addPhotos}>
            <MDI name="camera-outline" size={18} color="#06494F" />
            <Text style={styles.addPhotosText}>Agregar fotos</Text>
          </Pressable>
          {photos.length > 0 && (
            <View style={styles.photosGrid}>
              {photos.map((p) => (
                <Image key={p.localUri} source={{ uri: p.localUri }} style={styles.photo} />
              ))}
            </View>
          )}

          {/* Horario */}
          <Text style={[styles.label, { marginTop: 12 }]}>Horario</Text>
          <Text style={styles.smallHint}>
            Elegí si lo necesitás ahora o querés programar día y hora aproximados.
          </Text>

          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentBtn, mode === 'now' && styles.segmentOn]}
              onPress={() => {
                setMode('now');
                setScheduledAt(null);
              }}
            >
              <Text style={[styles.segmentText, mode === 'now' && styles.segmentTextOn]}>
                Ahora
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, mode === 'schedule' && styles.segmentOn]}
              onPress={() => {
                setMode('schedule');
                if (!scheduledAt) setScheduledAt(new Date());
              }}
            >
              <Text style={[styles.segmentText, mode === 'schedule' && styles.segmentTextOn]}>
                Programar
              </Text>
            </Pressable>
          </View>

          {mode === 'schedule' && (
            <View style={styles.scheduleRow}>
              <Pressable onPress={() => setShowDate(true)} style={styles.dateField}>
                <MDI name="calendar-month-outline" size={18} color="#06494F" />
                <Text
                  style={scheduledAt ? styles.dateFieldTextValue : styles.dateFieldTextPlaceholder}
                >
                  {scheduledAt ? formatDate(scheduledAt) : 'Seleccionar fecha'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!scheduledAt) setScheduledAt(new Date());
                  setShowTime(true);
                }}
                style={[styles.dateField, { flex: 0.9 }]}
              >
                <MDI name="clock-outline" size={18} color="#06494F" />
                <Text
                  style={scheduledAt ? styles.dateFieldTextValue : styles.dateFieldTextPlaceholder}
                >
                  {scheduledAt ? formatTime(scheduledAt) : 'Seleccionar hora'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Urgente */}
          <Pressable
            onPress={() => setUrgent((v) => !v)}
            style={[styles.urgent, urgent && styles.urgentOn]}
          >
            <MDI name="alert-decagram-outline" size={18} color={urgent ? '#06494F' : '#E9FEFF'} />
            <Text style={[styles.urgentText, urgent && styles.urgentTextOn]}>
              {urgent ? 'Urgente' : 'Marcar como urgente'}
            </Text>
          </Pressable>

          {/* Info visita técnica */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{visitInfo}</Text>
            <Text style={styles.infoSub}>Los costos de materiales se acordarán</Text>
          </View>
        </ScrollView>

        {/* Pickers */}
        {showDate && (
          <DateTimePicker
            value={scheduledAt ?? new Date()}
            mode="date"
            onChange={(_, d) => {
              setShowDate(false);
              if (d) {
                const base = scheduledAt ?? new Date();
                base.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setScheduledAt(new Date(base));
              }
            }}
          />
        )}
        {showTime && (
          <DateTimePicker
            value={scheduledAt ?? new Date()}
            mode="time"
            is24Hour
            onChange={(_, d) => {
              setShowTime(false);
              if (d) {
                const base = scheduledAt ?? new Date();
                base.setHours(d.getHours(), d.getMinutes(), 0, 0);
                setScheduledAt(new Date(base));
              }
            }}
          />
        )}

        {/* CTA fija */}
        <View
          style={[
            styles.ctaBar,
            {
              bottom: tabH + (insets.bottom || 0) + 8,
              paddingBottom: Math.max(10, insets.bottom || 0),
            },
          ]}
        >
          <Pressable
            style={[styles.confirmBtn, (submitting || meLoading) && { opacity: 0.7 }]}
            onPress={onConfirm}
            disabled={submitting || meLoading}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>Confirmar pedido</Text>
            )}
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => nav.goBack()} disabled={submitting}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#E9FEFF', fontWeight: '800', fontSize: 18 },

  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
  },

  label: { color: '#E9FEFF', fontWeight: '800', marginBottom: 6 },
  smallHint: {
    color: 'rgba(233,254,255,0.85)',
    fontSize: 12,
    marginBottom: 4,
  },

  inputRow: {
    backgroundColor: '#E9FEFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, color: '#06494F', paddingVertical: 2 },
  linkBtn: { paddingLeft: 8, paddingVertical: 4 },
  linkText: { color: '#0a7c86', fontWeight: '800' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.65)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: '#E9FEFF' },
  chipText: { color: '#E9FEFF', fontWeight: '700' },
  chipTextOn: { color: '#06494F' },

  textarea: {
    marginTop: 8,
    minHeight: 110,
    backgroundColor: '#E9FEFF',
    color: '#06494F',
    borderRadius: 14,
    padding: 12,
    textAlignVertical: 'top',
  },

  addPhotos: {
    marginTop: 10,
    backgroundColor: '#E9FEFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  addPhotosText: { color: '#06494F', fontWeight: '800' },

  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  photo: { width: 76, height: 76, borderRadius: 10 },

  segment: {
    marginTop: 4,
    flexDirection: 'row',
    backgroundColor: 'rgba(233,254,255,0.15)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentOn: { backgroundColor: '#E9FEFF' },
  segmentText: { color: '#E9FEFF', fontWeight: '800' },
  segmentTextOn: { color: '#06494F' },

  scheduleRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E9FEFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateFieldTextPlaceholder: {
    color: '#7fa5a9',
    fontWeight: '600',
  },
  dateFieldTextValue: {
    color: '#06494F',
    fontWeight: '800',
  },

  urgent: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urgentOn: { backgroundColor: '#E9FEFF' },
  urgentText: { color: '#E9FEFF', fontWeight: '800' },
  urgentTextOn: { color: '#06494F' },

  infoBox: {
    marginTop: 12,
    backgroundColor: 'rgba(233,254,255,0.22)',
    borderColor: 'rgba(233,254,255,0.5)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
  },
  infoTitle: { color: '#E9FEFF', fontWeight: '900' },
  infoSub: { color: 'rgba(233,254,255,0.9)', marginTop: 2 },

  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 10,
  },
  confirmBtn: {
    backgroundColor: '#ff8a00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: '#0dd1db', fontWeight: '800' },
});
