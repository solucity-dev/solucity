// apps/mobile/src/screens/CreateOrderScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
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
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RouteT = RouteProp<HomeStackParamList, 'CreateOrder'>;

type MeResponse = {
  ok: boolean;
  user: {
    id: string;
    role: 'CUSTOMER' | 'SPECIALIST' | 'ADMIN';
    email?: string | null;
    status?: 'ACTIVE' | 'BLOCKED' | string | null;
  };
  profiles: { customerId: string | null; specialistId: string | null };
  defaultAddress?: { id: string; formatted: string } | null;
};

type PhotoItem = {
  localUri: string;
  remoteUrl?: string | null;
};

function mkReqId(prefix = 'ORDER') {
  const a = Math.random().toString(36).slice(2, 8);
  const b = Date.now().toString(36).slice(-6);
  return `${prefix}-${b}-${a}`;
}

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

const LOCALITIES_CORDOBA_RAW = [
  // ✅ Capital / Gran Córdoba
  'Córdoba',
  'Villa Allende',
  'Unquillo',
  'Mendiolaza',
  'Saldán',
  'La Calera',
  'Malagueño',
  'Carlos Paz',
  'Bialet Massé',
  'Tanti',
  'Cosquín',
  'Santa María de Punilla',
  'Villa Santa Cruz del Lago',
  'Icho Cruz',
  'San Antonio de Arredondo',
  'Mayu Sumaj',

  // ✅ Sierras Chicas
  'Río Ceballos',
  'Salsipuedes',
  'Agua de Oro',
  'La Granja',
  'Ascochinga',
  'Jesús María',
  'Colonia Caroya',
  'Sinsacate',

  // ✅ Punilla / Valle de Punilla
  'La Falda',
  'Huerta Grande',
  'Villa Giardino',
  'Capilla del Monte',
  'San Marcos Sierras',
  'Cruz del Eje',
  'Villa de Soto',

  // ✅ Traslasierra
  'Villa Dolores',
  'Mina Clavero',
  'Nono',
  'Villa Cura Brochero',
  'Los Hornillos',
  'Las Rabonas',
  'San Javier y Yacanto',
  'San Pedro',
  'La Paz (Córdoba)',
  'Salsacate',
  'Taninga',
  'Villa de las Rosas',

  // ✅ Calamuchita
  'Santa Rosa de Calamuchita',
  'Villa General Belgrano',
  'La Cumbrecita',
  'Embalse',
  'Almafuerte',
  'Los Reartes',
  'Villa Rumipal',
  'Villa del Dique',
  'Yacanto',
  'Los Cóndores',

  // ✅ Río Tercero / Tancacha / zona
  'Río Tercero',
  'Tancacha',
  'Hernando',
  'General Fotheringham',

  // ✅ Centro / Villa María
  'Villa María',
  'Villa Nueva',
  'Bell Ville',
  'Justiniano Posse',
  'Marcos Juárez',
  'Leones',
  'Morrison',
  'Noetinger',
  'Oliva',
  'Oncativo',
  'Río Segundo',
  'Pilar (Córdoba)',

  // ✅ San Francisco / Este
  'San Francisco',
  'Arroyito',
  'Morteros',
  'Brinkmann',
  'Devoto',
  'Freyre',
  'La Francia',
  'Balnearia',
  'Miramar de Ansenuza',

  // ✅ Norte
  'Dean Funes',
  'Villa del Totoral',
  'Río Primero',
  'Quilino',
  'San José de la Dormida',

  // ✅ Sur / Río Cuarto (tu base)
  'Río Cuarto',
  'Las Higueras',
  'Santa Catalina Holmberg',
  'Sampacho',
  'Bulnes',
  'Coronel Moldes',
  'Chaján',
  'Achiras',
  'San Basilio',
  'La Cautiva',
  'Alcira Gigena',
  'Berrotarán',
  'Elena',
  'La Carlota',
  'Reducción',
  'General Cabrera',
  'Carnerillo',
  'General Deheza',
  'Vicuña Mackenna',
  'Washington',
  'Adelia María',

  // ✅ Laboulaye / sur-este
  'Laboulaye',
  'General Levalle',
  'Serrano',
  'Jovita',
  'Villa Huidobro',

  // ✅ Villa de María / Noroeste
  'Villa de María del Río Seco',
  'Sebastián Elcano',
] as const;

// ✅ Dedupe + orden alfabético
const LOCALITIES_CORDOBA = Array.from(new Set(LOCALITIES_CORDOBA_RAW)).sort((a, b) =>
  a.localeCompare(b, 'es'),
);

export default function CreateOrderScreen() {
  const insets = useSafeAreaInsets();
  const rawTabH = useBottomTabBarHeight();
  const tabH = Math.max(rawTabH, 60);

  const { params } = useRoute<RouteT>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  // ✅ Normalizamos params (evita warnings de deps con (params as any).xxx)
  const p = params as any;
  const paramAddress = (p?.address ?? '') as string;

  const visitPriceParam = p?.visitPrice as number | null | undefined;
  const pricingLabelParam = (p?.pricingLabel ?? '') as string;

  const categorySlugParam = p?.categorySlug as string | undefined;
  const locationIdParam = p?.locationId as string | undefined;
  const serviceIdParam = p?.serviceId as string | undefined;
  const specialistIdParam = p?.specialistId as string | undefined;
  const specialistNameParam = p?.specialistName as string | undefined;

  const reqIdRef = useRef<string>(mkReqId());

  // ✅ bloqueo instantáneo (evita doble tap antes de que React re-renderice)
  const submittingRef = useRef(false);

  // ========= Me (para obtener customerId y defaultAddressId) =========
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const t0 = Date.now();
      try {
        setMeLoading(true);
        setMeError(null);

        const r = await api.get<MeResponse>('/auth/me', {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!mounted) return;
        setMe(r.data);

        if (__DEV__) {
          console.log(
            `🧑‍💼 [CreateOrder][me] ok in ${Date.now() - t0}ms -> role=${r.data?.user?.role} userId=${r.data?.user?.id}`,
          );
        }
      } catch (e: any) {
        if (!mounted) return;
        setMeError(e?.message ?? 'No se pudo obtener usuario');
        if (__DEV__)
          console.log('🧑‍💼 [CreateOrder][me] ERR', e?.code, e?.response?.status, e?.message);
      } finally {
        if (mounted) setMeLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ========= Form state =========
  const [address, setAddress] = useState(paramAddress);
  type PlaceMode = 'AT_HOME' | 'AT_SPECIALIST' | 'ONLINE';
  const [placeMode, setPlaceMode] = useState<PlaceMode>('AT_HOME');

  const [locality, setLocality] = useState('Río Cuarto');
  const [localityOpen, setLocalityOpen] = useState(false);
  const [localityQuery, setLocalityQuery] = useState('');

  useEffect(() => {
    if (!paramAddress && me?.defaultAddress?.formatted) {
      setAddress(me.defaultAddress.formatted);
    }
  }, [me?.defaultAddress?.formatted, paramAddress]);

  const [desc, setDesc] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [mode, setMode] = useState<'now' | 'schedule'>('now');

  // fecha/hora nativas
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [ctaHeight, setCtaHeight] = useState(0);

  // ✅ Tarifa / pricingLabel (fallback "Tarifa")
  const pricingLabel = useMemo(() => {
    const clean = pricingLabelParam.trim();
    return clean.length ? clean : 'Tarifa';
  }, [pricingLabelParam]);

  const visitInfo = useMemo(() => {
    return visitPriceParam != null
      ? `${pricingLabel}: $${visitPriceParam.toLocaleString('es-AR')}`
      : `${pricingLabel}: a consultar`;
  }, [pricingLabel, visitPriceParam]);

  const filteredLocalities = useMemo(() => {
    const q = localityQuery.trim().toLowerCase();
    if (!q) return LOCALITIES_CORDOBA;

    return LOCALITIES_CORDOBA.filter((x) => x.toLowerCase().includes(q));
  }, [localityQuery]);

  function formatDate(d: Date) {
    return d.toLocaleDateString();
  }
  function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ========= Upload imágenes =========
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
        // ✅ compatible con tu versión (evita TS2339)
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
        // ✅ compatible con tu versión (evita TS2339)
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
    // ✅ si ya está enviando, no hacemos nada (bloqueo instantáneo)
    if (submittingRef.current) return;
    submittingRef.current = true;

    const reqId = reqIdRef.current || mkReqId();
    reqIdRef.current = reqId;

    try {
      if (__DEV__) {
        console.log(`🟨 [CreateOrder][${reqId}] start`);
        console.log(`🟨 [CreateOrder][${reqId}] role=${me?.user?.role} userId=${me?.user?.id}`);
        console.log(
          `🧾 [CreateOrder][${reqId}] params snapshot =>`,
          safeJson({
            categorySlug: categorySlugParam,
            locationIdFromParams: locationIdParam,
            serviceIdFromParams: serviceIdParam,
            specialistId: specialistIdParam,
            specialistName: specialistNameParam,
            visitPrice: visitPriceParam,
            pricingLabel: pricingLabelParam,
          }),
        );
      }

      const baseAddress = address.trim();
      const loc = (locality ?? '').trim();

      // ✅ Dirección obligatoria SOLO si es a domicilio
      if (placeMode === 'AT_HOME' && !baseAddress) {
        Alert.alert('Falta la dirección', 'Indicá dónde realizar el trabajo.');
        return;
      }

      // ✅ Armamos addressText según modalidad
      const typedFormatted =
        placeMode === 'AT_HOME'
          ? loc
            ? `${baseAddress}, ${loc}, Córdoba`
            : baseAddress
          : placeMode === 'AT_SPECIALIST'
            ? `En local/oficina — ${loc ? `${loc}, Córdoba` : 'Córdoba'}`
            : `Online — ${loc ? `${loc}, Córdoba` : 'Córdoba'}`;

      if (mode === 'schedule' && !scheduledAt) {
        Alert.alert('Faltan datos', 'Indicá fecha y hora o elegí “Ahora”.');
        return;
      }

      if (!me?.ok) {
        Alert.alert('Sesión requerida', 'No pudimos identificar al usuario (auth/me).');
        return;
      }

      // ✅ BLOQUEO CLIENTE (solo frontend): si está BLOCKED no puede crear órdenes
      if (String(me?.user?.status ?? '').toUpperCase() === 'BLOCKED') {
        Alert.alert(
          'Cuenta bloqueada',
          'Tu cuenta está bloqueada y no podés crear pedidos. Contactá soporte.',
        );
        return;
      }

      const customerId = me?.profiles?.customerId;
      if (!customerId) {
        Alert.alert('Sesión requerida', 'No pudimos identificar el perfil de cliente (auth/me).');
        return;
      }

      // ✅ Rubro (categorySlug) desde el que se eligió al especialista
      const categorySlug = categorySlugParam;
      if (!categorySlug || !categorySlug.trim()) {
        Alert.alert(
          'Falta el rubro',
          'No recibimos categorySlug. Volvé atrás y entrá desde un rubro.',
        );
        return;
      }

      setSubmitting(true);

      // ========== serviceId ==========
      let serviceId: string | undefined = serviceIdParam;

      // Si no viene serviceId, lo inferimos consultando al especialista con categorySlug
      if (!serviceId && specialistIdParam) {
        const t0 = Date.now();
        try {
          const qs = `?categorySlug=${encodeURIComponent(categorySlug)}`;
          const spec = await api.get(`/specialists/${specialistIdParam}${qs}`);

          if (__DEV__) {
            const rootKeys = Object.keys(spec.data ?? {});
            const servicesLen = Array.isArray(spec.data?.services) ? spec.data.services.length : 0;
            console.log(
              `🟦 [CreateOrder][${reqId}] GET /specialists/:id ok in ${Date.now() - t0}ms`,
            );
            console.log(
              `🧩 [CreateOrder][${reqId}] /specialists/:id shape =>`,
              safeJson({
                rootKeys,
                defaultServiceId: spec.data?.defaultServiceId,
                servicesLen,
                firstServiceId: spec.data?.services?.[0]?.id,
              }),
            );
          }

          serviceId = spec.data?.defaultServiceId || spec.data?.services?.[0]?.id || undefined;

          if (__DEV__) console.log(`🟦 [CreateOrder][${reqId}] extracted serviceId ->`, serviceId);
        } catch (e: any) {
          if (__DEV__) {
            console.log(
              `🟥 [CreateOrder][${reqId}] GET /specialists/:id failed`,
              e?.code,
              e?.response?.status,
              e?.message,
            );
          }
        }
      }

      if (!serviceId) {
        Alert.alert(
          'Falta elegir servicio',
          'Este especialista no tiene servicios disponibles para este rubro.',
        );
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }

      // ========== locationId SOLO si corresponde ==========
      // ✅ Solo tiene sentido enviar locationId si es a domicilio.
      // Para "en local/oficina" u "online" dejamos locationId null.
      const defaultFormatted = me?.defaultAddress?.formatted?.trim() ?? '';
      const explicitLocationId = locationIdParam;

      let locationIdToSend: string | null = null;

      if (placeMode === 'AT_HOME') {
        const hasManualAddress = typedFormatted.length > 0 && typedFormatted !== defaultFormatted;

        const shouldSendLocationId =
          !!explicitLocationId || (!hasManualAddress && typedFormatted === defaultFormatted);

        // ✅ Acá está el fix TS: nunca asignamos undefined
        locationIdToSend = explicitLocationId
          ? explicitLocationId
          : shouldSendLocationId
            ? (me?.defaultAddress?.id ?? null)
            : null;
      } else {
        locationIdToSend = null;
      }

      // subir fotos
      const photosWithRemote = await Promise.all(
        photos.map(async (pp) => {
          if (pp.remoteUrl) return pp;
          const url = await uploadOrderImage(pp.localUri);
          return { ...pp, remoteUrl: url };
        }),
      );

      const attachments = photosWithRemote
        .filter((pp) => !!pp.remoteUrl)
        .map((pp) => ({ type: 'image', url: pp.remoteUrl }));

      // ✅ descripción SOLO texto libre
      const description = desc.trim();

      const payload: any = {
        customerId,
        specialistId: specialistIdParam,
        serviceId,
        categorySlug, // audit/log
        placeMode, // ✅ NUEVO
        description: description || null,
        attachments,
        isUrgent: urgent || mode === 'now',
        ...(locationIdToSend ? { locationId: locationIdToSend } : {}),
        addressText: typedFormatted || null,
      };

      if (mode === 'now') payload.preferredAt = new Date().toISOString();
      if (mode === 'schedule' && scheduledAt) payload.scheduledAt = scheduledAt.toISOString();

      if (__DEV__) {
        console.log(
          `📦 [CreateOrder][${reqId}] payload =>`,
          safeJson({
            customerId,
            specialistId: payload.specialistId,
            serviceId: payload.serviceId,
            locationId: payload.locationId,
            addressText: payload.addressText,
            isUrgent: payload.isUrgent,
            preferredAt: payload.preferredAt,
            scheduledAt: payload.scheduledAt,
            attachmentsCount: attachments.length,
            categorySlug,
          }),
        );
      }

      const r = await api.post('/orders', payload, {
        headers: { 'x-user-id': me?.user.id ?? '' },
      });

      if (__DEV__) console.log(`✅ [CreateOrder][${reqId}] POST /orders ok ->`, safeJson(r.data));

      Alert.alert(
        '¡Pedido enviado!',
        `Tu solicitud fue creada para ${specialistNameParam ?? 'el especialista'}.`,
      );

      nav.goBack();
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      console.log('🟥 [CreateOrder] error status =', status);
      console.log('🟥 [CreateOrder] error data =', safeJson(data));

      const msg =
        data?.error?.message ||
        data?.error ||
        (status === 401
          ? 'Sesión expirada. Volvé a iniciar sesión.'
          : 'No se pudo crear la orden.');

      Alert.alert('Error', String(msg));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isBlocked = String(me?.user?.status ?? '').toUpperCase() === 'BLOCKED';

  const canInteract = !(submitting || meLoading || isBlocked);

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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: ctaHeight + 24,
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

          <Text style={styles.label}>¿Dónde se realiza?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {[
              { k: 'AT_HOME' as const, t: 'A domicilio' },
              { k: 'AT_SPECIALIST' as const, t: 'En local/oficina' },
              { k: 'ONLINE' as const, t: 'Online' },
            ].map((opt) => {
              const on = placeMode === opt.k;
              return (
                <Pressable
                  key={opt.k}
                  onPress={() => setPlaceMode(opt.k)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: on ? '#E9FEFF' : 'rgba(233,254,255,0.15)',
                    borderWidth: 1,
                    borderColor: 'rgba(233,254,255,0.35)',
                  }}
                >
                  <Text
                    style={{ fontWeight: '900', color: on ? '#06494F' : '#E9FEFF', fontSize: 12 }}
                  >
                    {opt.t}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Dirección */}
          {placeMode === 'AT_HOME' ? (
            <>
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
            </>
          ) : (
            <Text style={{ color: 'rgba(233,254,255,0.85)', marginBottom: 8 }}>
              {placeMode === 'AT_SPECIALIST'
                ? 'El especialista te indicará su dirección (local/oficina) al confirmar.'
                : 'La atención se realizará online. Coordinaremos por chat.'}
            </Text>
          )}

          {/* Localidad */}
          <Text style={[styles.label, { marginTop: 10 }]}>Localidad</Text>

          <Pressable
            style={styles.inputRow}
            onPress={() => {
              setLocalityQuery('');
              setLocalityOpen(true);
            }}
          >
            <MDI name="map-marker-radius-outline" size={18} color="#06494F" />

            <Text style={{ flex: 1, color: '#06494F', fontWeight: '800' }}>
              {locality || 'Seleccionar localidad'}
            </Text>

            <Ionicons name="chevron-down" size={18} color="#06494F" />
          </Pressable>

          <Modal
            visible={localityOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setLocalityOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.55)',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <View style={{ backgroundColor: '#E9FEFF', borderRadius: 16, padding: 14 }}>
                <Text
                  style={{
                    color: '#06494F',
                    fontWeight: '900',
                    fontSize: 16,
                    marginBottom: 10,
                  }}
                >
                  Elegir localidad
                </Text>

                <TextInput
                  value={localityQuery}
                  onChangeText={setLocalityQuery}
                  placeholder="Buscar localidad…"
                  placeholderTextColor="#7fa5a9"
                  style={{
                    backgroundColor: 'rgba(6,73,79,0.08)',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: '#06494F',
                    marginBottom: 10,
                    fontWeight: '700',
                  }}
                />

                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {filteredLocalities.map((loc) => (
                    <Pressable
                      key={loc}
                      onPress={() => {
                        setLocality(loc);
                        setLocalityQuery('');
                        setLocalityOpen(false);
                      }}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderRadius: 12,
                        backgroundColor: loc === locality ? 'rgba(6,73,79,0.10)' : 'transparent',
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ color: '#06494F', fontWeight: '800' }}>{loc}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Pressable
                  onPress={() => {
                    setLocalityQuery('');
                    setLocalityOpen(false);
                  }}
                  style={{
                    marginTop: 8,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: '#06494F',
                  }}
                >
                  <Text style={{ color: '#E9FEFF', fontWeight: '900' }}>Cerrar</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          {/* ✅ Descripción (solo texto libre) */}
          <Text style={[styles.label, { marginTop: 12 }]}>Descripción del problema</Text>
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
          <Pressable
            onPress={async () => {
              Keyboard.dismiss();
              await new Promise((r) => setTimeout(r, 80)); // ✅ evita doble tap Android
              pickImages();
            }}
            style={styles.addPhotos}
          >
            <MDI name="camera-outline" size={18} color="#06494F" />
            <Text style={styles.addPhotosText}>Agregar fotos</Text>
          </Pressable>
          {photos.length > 0 && (
            <View style={styles.photosGrid}>
              {photos.map((pp) => (
                <Image key={pp.localUri} source={{ uri: pp.localUri }} style={styles.photo} />
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

          {/* ✅ Info tarifa */}
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
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            // altura real del CTA + espacio por tabbar + safe area
            setCtaHeight(h + tabH + (insets.bottom || 0) + 12);
          }}
          style={[
            styles.ctaBar,
            {
              bottom: tabH + (insets.bottom || 0) + 8,
              paddingBottom: Math.max(10, insets.bottom || 0),
            },
          ]}
        >
          <Pressable
            style={[styles.confirmBtn, !canInteract && styles.btnDisabled]}
            onPress={() => {
              if (!canInteract) return;
              onConfirm();
            }}
            disabled={!canInteract}
          >
            {submitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.confirmText}>Enviando…</Text>
              </View>
            ) : (
              <Text style={styles.confirmText}>Confirmar pedido</Text>
            )}
          </Pressable>

          {/* ✅ Cancel button mejorado (se ve como botón) */}
          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              !canInteract && { opacity: 0.6 },
              pressed && canInteract && { opacity: 0.95, transform: [{ scale: 0.99 }] },
            ]}
            onPress={() => nav.goBack()}
            disabled={submitting}
          >
            <Ionicons name="close" size={18} color="#E9FEFF" />
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
  btnDisabled: {
    opacity: 0.75,
  },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  // ✅ botón cancel visible + consistente con el theme
  cancelBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.55)',
    backgroundColor: 'rgba(0, 35, 40, 0.18)',
  },
  cancelText: { color: '#E9FEFF', fontWeight: '900' },
});
