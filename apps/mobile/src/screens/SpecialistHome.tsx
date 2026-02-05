// apps/mobile/src/screens/SpecialistHome.tsx
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { markLocationSynced } from '../lib/locationOnce';
import {
  listCertifications,
  uploadCertificationAnyFile,
  uploadCertificationFile,
  upsertCertification,
  type CertItem,
} from '../lib/specialistsApi';
import { getMySubscription, type SubscriptionInfo } from '../lib/subscriptionApi';
import { useNotifications } from '../notifications/NotificationsProvider';

import type { SpecialistHomeStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type SpecProfile = {
  bio: string;
  available: boolean;
  radiusKm: number | null;
  visitPrice: number | null;

  pricingLabel?: string | null;

  availability: { days: number[]; start: string; end: string; enabled?: boolean };
  ratingAvg: number | null;
  ratingCount: number | null;
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | null;
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  backgroundCheck?: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewedAt?: string | null;
    rejectionReason?: string | null;
    fileUrl?: string | null;
  } | null;
  specialties: string[];
  avatarUrl?: string | null;
  name?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  stats?: {
    done: number;
    canceled: number;
  };
};

type ReviewItem = {
  id: string;
  createdAt: string;
  score: number;
  comment: string | null;
  serviceName: string;
  customerName: string;
};

function absoluteUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${api.defaults.baseURL?.replace(/\/+$/, '')}${u}`;
  return u;
}

function fileLabelFromUrl(u?: string | null) {
  if (!u) return null;
  const clean = String(u).split('?')[0]; // saca querystring
  const parts = clean.split('/');
  const last = parts[parts.length - 1] || '';
  return last && last.length <= 40 ? decodeURIComponent(last) : null;
}

function maskedCertRowText(c?: CertItem | null) {
  if (!c?.fileUrl) return 'Sin archivo subido';

  const pieces: string[] = [];
  if (c.number) pieces.push(`# ${c.number}`);
  if (c.issuer) pieces.push(String(c.issuer));

  // si tenemos algún dato “humano”, lo mostramos
  if (pieces.length) return pieces.join(' · ');

  // si no hay issuer/number, mostramos un label genérico
  const name = fileLabelFromUrl(c.fileUrl);
  return name ? `Archivo subido: ${name}` : 'Archivo subido';
}

// ✅ Fallback: si /categories falla, no te quedás sin rubros
const SPECIALTY_OPTIONS = [
  // ── Construcción & Mantenimiento ──────────────────────────
  'albanileria',
  'electricidad',
  'yeseria-durlock',
  'carpinteria',
  'herreria',
  'plomeria-gasista',
  'pintura',
  'jardineria',
  'piscinas',
  'desagote-y-banos-quimicos',
  'soldador',

  // ── Informática & Electrónica ─────────────────────────────
  'climatizacion',
  'servicio-tecnico-electronica',
  'servicio-tecnico-electrodomesticos',
  'servicio-tecnico-informatica',

  // ── Seguridad ─────────────────────────────────────────────
  'cerrajeria',
  'camaras-y-alarmas',
  'personal-de-seguridad',

  // ── Servicios Generales ───────────────────────────────────
  'limpieza',
  'clases-particulares',
  'paseador-de-perros',
  'acompanante-terapeutico',
  'fletes',
  'diseno-de-interiores',

  // ── Gastronomía ───────────────────────────────────────────
  'camarero-mozo',
  'cocinero',
  'bartender',
  'catering',
  'ayudante-de-cocina',

  // ── Profesionales ─────────────────────────────────────────
  'abogado',
  'contador',
  'escribano',
  'arquitecto',
  'ingeniero',
] as const;

const REQUIRES_CERT_FALLBACK = new Set([
  'plomeria-gasista',
  'electricidad',
  'climatizacion',
  'servicio-tecnico-electronica',
  'servicio-tecnico-electrodomesticos',
  'servicio-tecnico-informatica',
  'camaras-y-alarmas',
  'personal-de-seguridad',
  'cerrajeria',
  'acompanante-terapeutico',
  'diseno-de-interiores',
  'abogado',
  'contador',
  'escribano',
  'arquitecto',
  'ingeniero',
]);

// 🔒 Rubros legacy que queremos ocultar SOLO en SpecialistHome
const HIDDEN_SPECIALTIES = new Set<string>([
  'plomeria', // legacy: existe en DB pero usamos "plomeria-gasista"
]);

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.sectionHdr} onPress={onToggle}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#E9FEFF" />
      </Pressable>
      {open ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </View>
  );
}

export default function SpecialistHome() {
  const insets = useSafeAreaInsets();

  const navigation = useNavigation<NativeStackNavigationProp<SpecialistHomeStackParamList>>();
  const { unread } = useNotifications();

  // auth (usamos any para no pelear con tipos viejos)
  const auth = useAuth() as any;
  const token: string | null = auth.token ?? null;
  const logout: (() => void) | undefined = auth.logout;
  const uid: string | null = auth?.user?.id ?? null;

  // ✅ Loading real
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // ✅ Snapshots (baseline) para detectar cambios por bloque
  const bioSnapRef = useRef<string>('');
  const availabilitySnapRef = useRef<string>(''); // guardamos JSON string
  const priceRadiusSnapRef = useRef<string>(''); // guardamos JSON string
  const specialtiesSnapRef = useRef<string>(''); // guardamos JSON string

  const [profile, setProfile] = useState<SpecProfile | null>(null);

  // avatar
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  // certificaciones
  const [certs, setCerts] = useState<CertItem[]>([]);
  const [certSavingBySlug, setCertSavingBySlug] = useState<Record<string, boolean>>({});
  const [openCerts, setOpenCerts] = useState(true);

  // catálogo rubros
  type CategoryOption = {
    slug: string;
    name: string;
    groupSlug: string;
    groupName: string;
    requiresCertification?: boolean;
  };

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const categoriesLoadedOnceRef = useRef(false);

  // ✅ Si ya cargó el catálogo real, limpiamos specialties inválidos que pudieron venir del fallback
  useEffect(() => {
    if (!categoryOptions.length) return;

    const valid = new Set(categoryOptions.map((c) => c.slug));
    setSpecialties((prev) => prev.filter((s) => valid.has(s)));
  }, [categoryOptions]);

  useEffect(() => {
    if (!categoryOptions.length) return;

    const bySlug = new Map(categoryOptions.map((c) => [c.slug, c.slug]));
    const byName = new Map(categoryOptions.map((c) => [toSlugLike(c.name), c.slug]));

    setSpecialties((prev) => {
      const next = prev
        .map((raw) => {
          const s = String(raw ?? '').trim();
          if (!s) return null;

          // ya es slug válido
          if (bySlug.has(s)) return s;

          // capaz viene como nombre “humano”
          const maybe = byName.get(toSlugLike(s));
          return maybe ?? s; // fallback: lo dejamos, no lo perdemos
        })
        .filter(Boolean) as string[];

      // dedupe
      return Array.from(new Set(next));
    });
  }, [categoryOptions]);

  // ⭐ reseñas
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // form fields
  const [bio, setBio] = useState('');
  const [availableNow, setAvailableNow] = useState(true); // switch (intención)
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [specialties, setSpecialties] = useState<string[]>([]);

  // ✅ pickers hora
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  function timeStringToDate(t: string) {
    const [h, m] = t.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }

  function dateToTimeString(d: Date) {
    return d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // tarifa y radio
  const [price, setPrice] = useState<string>('0');
  const [radius, setRadius] = useState<string>('10');

  // etiqueta precio
  const [pricingLabel, setPricingLabel] = useState<string>('');

  // suscripción
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  // ubicación: auto-update una sola vez, sin bloquear
  const locationRequestedRef = useRef(false);

  // ✅ loading por rubro (solo el botón que se está subiendo)
  function setCertLoading(slug: string, v: boolean) {
    setCertSavingBySlug((prev) => ({ ...prev, [slug]: v }));
  }
  function isCertLoading(slug: string) {
    return !!certSavingBySlug[slug];
  }

  // ✅ Catálogo rubros: GET /categories (background)
  // ✅ Catálogo rubros: GET /categories (background)
  const loadCategories = useCallback(async () => {
    if (categoriesLoadedOnceRef.current) return;
    categoriesLoadedOnceRef.current = true;

    try {
      const res = await api.get('/categories');

      // Soporta múltiples formatos: [] | {groups:[]} | {data:[]} | {items:[]} | {ok:true, groups:[]}
      const raw = res?.data;

      const groups = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.groups)
          ? raw.groups
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.items)
              ? raw.items
              : Array.isArray(raw?.result)
                ? raw.result
                : [];

      const flat: CategoryOption[] = groups
        .flatMap((g: any) =>
          (Array.isArray(g?.categories) ? g.categories : []).map((c: any) => ({
            slug: c?.slug,
            name: c?.name,
            groupSlug: g?.slug,
            groupName: g?.name,
            requiresCertification: !!c?.requiresCertification,
          })),
        )
        .filter((x: any) => !!x?.slug);

      if (__DEV__) {
        console.log('[/categories] raw keys:', Object.keys(res?.data ?? {}));
        console.log('[/categories] raw sample:', res?.data);
        console.log('[/categories] flat length:', flat.length);
        console.log('[/categories] flat sample:', flat.slice(0, 5));
      }

      setCategoryOptions(flat);
    } catch (e) {
      if (__DEV__) console.log('[loadCategories] error', e);
    }
  }, []);

  const requiresCert = useCallback(
    (slug: string) => {
      const fromApi = categoryOptions.find((c) => c.slug === slug)?.requiresCertification;

      // ✅ Si el backend dice TRUE, listo.
      if (fromApi === true) return true;

      // ✅ Si el backend dice FALSE o no viene, usamos nuestro fallback local
      return REQUIRES_CERT_FALLBACK.has(slug);
    },
    [categoryOptions],
  );

  function normalizeSpecialties(input: any): string[] {
    if (!input) return [];
    if (!Array.isArray(input)) return [];

    if (input.every((x) => typeof x === 'string')) {
      const slugs = input.map((s) => s.trim()).filter(Boolean);

      const normalized = slugs.map((s) => (s === 'plomeria' ? 'plomeria-gasista' : s));
      return Array.from(new Set(normalized));
    }

    const slugs = input
      .map((x) => {
        if (!x) return null;
        if (typeof x === 'string') return x.trim();
        if (typeof x?.slug === 'string') return x.slug.trim();
        if (typeof x?.category?.slug === 'string') return x.category.slug.trim();
        return null;
      })
      .filter(Boolean) as string[];

    const normalized = slugs.map((s) => (s === 'plomeria' ? 'plomeria-gasista' : s));
    return Array.from(new Set(normalized));
  }

  function toSlugLike(s: string) {
    return String(s)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/-+/g, '-');
  }

  function catNameBySlug(slug: string) {
    return categoryOptions.find((c) => c.slug === slug)?.name ?? slug;
  }

  // Ubicación: pedir permisos, obtener coords y guardarlas (no bloqueante)
  const updateLocationFromDevice = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? true;
      try {
        if (!silent) setSaving(true);

        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (!silent) {
            Alert.alert(
              'Permiso requerido',
              'Necesitamos acceder a tu ubicación para mostrarte en las búsquedas cercanas.',
            );
          }
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        await api.patch('/specialists/me', {
          centerLat: lat,
          centerLng: lng,
        });

        if (uid) {
          await markLocationSynced(uid, { lat, lng });
        }

        setProfile((prev) =>
          prev
            ? {
                ...prev,
                centerLat: lat,
                centerLng: lng,
              }
            : prev,
        );

        if (!silent) {
          Alert.alert('Listo', 'Actualizamos tu ubicación para las búsquedas cercanas.');
        }
      } catch (e) {
        if (__DEV__) console.log('[updateLocationFromDevice] error', e);
        if (!silent) {
          Alert.alert('Ups', 'No pudimos actualizar tu ubicación. Probá de nuevo más tarde.');
        }
      } finally {
        if (!silent) setSaving(false);
      }
    },
    [uid], // ✅ esto soluciona el warning y evita stale closure
  );

  // ✅ PERFIL bloqueante / lo demás background
  const reloadProfileAndSubscription = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? true;

      try {
        if (!silent) setLoading(true);

        // 1) PERFIL
        const { data } = await api.get('/specialists/me', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!data?.ok) throw new Error('bad_response');
        const p: SpecProfile = data.profile;
        if (__DEV__) {
          console.log('[/specialists/me] specialties raw:', p.specialties);
          console.log('[/specialists/me] kyc:', p.kycStatus, 'bg:', p.backgroundCheck?.status);
        }

        setProfile(p);
        setBio(p.bio ?? '');

        // si todavía no viene (backend viejo), fallback a p.available
        setAvailableNow(
          typeof (p as any).availableNow === 'boolean' ? (p as any).availableNow : !!p.available,
        );

        const avail = p.availability ?? {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '18:00',
        };
        setDays(avail.days ?? [1, 2, 3, 4, 5]);
        setStart(avail.start ?? '09:00');
        setEnd(avail.end ?? '18:00');

        setSpecialties(normalizeSpecialties((p as any).specialties));
        setAvatar(p.avatarUrl ?? null);

        setPrice(String(p.visitPrice ?? 0));
        setRadius(String(p.radiusKm ?? 10));

        setPricingLabel((p.pricingLabel ?? '').trim());
        // ✅ actualizar snapshots (baseline) SOLO cuando viene del backend
        const bioBase = p.bio ?? '';
        bioSnapRef.current = bioBase;

        const availBase = {
          days: p.availability?.days ?? [1, 2, 3, 4, 5],
          start: p.availability?.start ?? '09:00',
          end: p.availability?.end ?? '18:00',
        };
        availabilitySnapRef.current = JSON.stringify(availBase);

        const priceBase = {
          visitPrice: p.visitPrice ?? 0,
          radiusKm: p.radiusKm ?? 10,
          pricingLabel: (p.pricingLabel ?? '').trim(),
        };
        priceRadiusSnapRef.current = JSON.stringify(priceBase);

        const specsBase = normalizeSpecialties((p as any).specialties);
        specialtiesSnapRef.current = JSON.stringify(Array.from(new Set(specsBase)).sort());
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) {
          if (__DEV__) console.log('[SpecialistHome] 401, forzando logout');
          Alert.alert('Sesión expirada', 'Volvé a iniciar sesión para continuar.', [
            {
              text: 'OK',
              onPress: () => {
                try {
                  logout?.();
                } catch {}
              },
            },
          ]);
        } else {
          if (!silent) Alert.alert('Ups', 'No se pudo cargar tu perfil');
        }
      } finally {
        if (!silent) setLoading(false);
      }

      // 2) CERTS (background)
      try {
        const items = await listCertifications();
        setCerts(items);
      } catch {}

      // 3) SUSCRIPCIÓN (background)
      try {
        const sub = await getMySubscription();
        setSubscription(sub);
      } catch (e) {
        if (__DEV__) console.log('[Subscription] error al cargar', e);
      }
    },
    [logout],
  );

  // ✅ Reseñas en background post-interactions
  const loadReviews = useCallback(async () => {
    if (!token) return;
    try {
      setReviewsLoading(true);

      const { data } = await api.get('/orders/mine', {
        params: { role: 'specialist', status: 'closed' },
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!data?.ok || !Array.isArray(data.orders)) return;

      const rated = data.orders.filter((o: any) => o.rating?.score);

      rated.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const mapped: ReviewItem[] = rated.map((o: any) => ({
        id: o.id,
        createdAt: o.createdAt,
        score: o.rating.score,
        comment: o.rating.comment ?? null,
        serviceName: o.service?.name ?? 'Servicio',
        customerName: o.customer?.name ?? 'Cliente',
      }));

      setReviews(mapped);
    } catch (e) {
      if (__DEV__) console.log('[SpecialistHome] error cargando reseñas', e);
    } finally {
      setReviewsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    loadCategories();
    reloadProfileAndSubscription({ silent: false });

    const task = InteractionManager.runAfterInteractions(() => {
      loadReviews();
    });

    return () => {
      const maybeCancel = (task as any)?.cancel;
      if (typeof maybeCancel === 'function') maybeCancel();
    };
  }, [token, loadCategories, reloadProfileAndSubscription, loadReviews]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      reloadProfileAndSubscription({ silent: true });
      loadCategories();
    }, [token, reloadProfileAndSubscription, loadCategories]),
  );

  // ✅ pedir ubicación apenas entra el especialista (una vez por sesión y sin bloquear)
  useEffect(() => {
    if (!token) return;
    if (locationRequestedRef.current) return;

    // 👇 SOLO si el backend todavía no tiene centerLat/centerLng
    const missingCenter = !profile?.centerLat || !profile?.centerLng;
    if (!missingCenter) return;

    locationRequestedRef.current = true;

    InteractionManager.runAfterInteractions(() => {
      updateLocationFromDevice({ silent: true });
    });
  }, [token, profile?.centerLat, profile?.centerLng, updateLocationFromDevice]);

  const avatarSrc = useMemo(() => {
    const u = absoluteUrl(avatar);
    return u ? { uri: u } : require('../assets/avatar-placeholder.png');
  }, [avatar]);

  const statsDone = profile?.stats?.done ?? 0;
  const statsCanceled = profile?.stats?.canceled ?? 0;

  const kycStatus = profile?.kycStatus ?? 'UNVERIFIED';
  const bgStatus = profile?.backgroundCheck?.status ?? null;

  // ✅ Suscripción OK: ACTIVE o TRIALING con días > 0
  const subscriptionOk = useMemo(() => {
    if (!subscription) return true; // fail-open (si no cargó aún, no bloqueamos)
    if (subscription.status === 'ACTIVE') return true;

    if (subscription.status === 'TRIALING') {
      // si backend manda daysRemaining, lo respetamos
      if (typeof subscription.daysRemaining === 'number') {
        return subscription.daysRemaining > 0;
      }
      // si no viene daysRemaining, asumimos trial vigente
      return true;
    }

    // PAST_DUE / CANCELLED / INACTIVE / etc.
    return false;
  }, [subscription]);

  const canToggleAvailability =
    kycStatus === 'VERIFIED' && bgStatus === 'APPROVED' && subscriptionOk;

  // ✅ La pill debe reflejar el switch (si está habilitado para togglear)
  const visibleEffective = canToggleAvailability && availableNow;

  // permisos para cámara / galería
  async function requestCamera() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== 'granted') {
      Alert.alert('Permisos', 'Necesitamos permiso de cámara para sacar tu foto.');
      return false;
    }
    return true;
  }
  async function requestMedia() {
    const med = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (med.status !== 'granted') {
      Alert.alert('Permisos', 'Necesitamos permiso para acceder a tus fotos.');
      return false;
    }
    return true;
  }

  // avatar
  async function openCamera() {
    if (!(await requestCamera())) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setLocalUri(res.assets[0].uri);
      setPickerOpen(false);
      setPreviewOpen(true);
    }
  }
  async function openGallery() {
    if (!(await requestMedia())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setLocalUri(res.assets[0].uri);
      setPickerOpen(false);
      setPreviewOpen(true);
    }
  }
  async function confirmAvatar() {
    if (!localUri) return;
    try {
      setSaving(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );

      const form = new FormData();
      form.append('file', {
        uri: manipulated.uri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);

      const up = await api.post('/specialists/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const urlRel: string | undefined = up?.data?.url;
      if (!urlRel) throw new Error('upload_failed');

      await api.patch('/specialists/me', { avatarUrl: urlRel });
      setAvatar(urlRel);
      setPreviewOpen(false);
      setLocalUri(null);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error === 'low_quality'
          ? 'La imagen es muy chica. Probá con otra más nítida o con mejor luz.'
          : 'No se pudo actualizar tu foto de perfil.';
      Alert.alert('Ups', msg);
    } finally {
      setSaving(false);
    }
  }

  // saves
  async function saveBio() {
    try {
      setSaving(true);
      await api.patch('/specialists/me', { bio });
      setProfile((prev) => (prev ? { ...prev, bio } : prev));
      Alert.alert('Listo', 'Biografía actualizada.');
      bioSnapRef.current = bio;
    } catch {
      Alert.alert('Ups', 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(v: boolean) {
    // 1) Si el problema es suscripción, lo mandamos directo a la pantalla de suscripción
    if (!subscriptionOk) {
      Alert.alert(
        'Suscripción requerida',
        'Para activarte y aparecer en búsquedas necesitás tener la suscripción activa.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ver suscripción', onPress: () => (navigation as any).navigate('Subscription') },
        ],
      );
      return;
    }

    // 2) Si el problema es KYC / antecedentes, mostramos el mensaje correspondiente
    if (!(kycStatus === 'VERIFIED' && bgStatus === 'APPROVED')) {
      Alert.alert(
        'Verificación requerida',
        'Para activar tu disponibilidad necesitás verificacion de identidad y el certificado de buena conducta aprobado.',
      );
      return;
    }

    try {
      setAvailableNow(v);
      await api.patch('/specialists/me', { availableNow: v });

      // ✅ asegura coherencia contra reglas server-side
      await reloadProfileAndSubscription({ silent: true });
    } catch (e: any) {
      const err = e?.response?.data?.error;

      if (e?.response?.status === 403 && err === 'background_check_required') {
        Alert.alert(
          'Antecedentes requeridos',
          'Para activar tu disponibilidad necesitás tener el antecedente penal aprobado.',
        );
        setAvailableNow(false);
        return;
      }

      if (e?.response?.status === 403 && err === 'user_blocked') {
        Alert.alert('Cuenta bloqueada', 'Tu cuenta está bloqueada. Contactá soporte.');
        setAvailableNow(false);
        return;
      }

      if (e?.response?.status === 403 || err === 'kyc_required') {
        Alert.alert(
          'Verificación requerida',
          'Para activar tu disponibilidad necesitás verificacion de identidad y antecedentes aprobados.',
        );
        setAvailableNow(false);
        return;
      }

      setAvailableNow(false);
      Alert.alert('Ups', 'No se pudo actualizar el estado.');
    }
  }

  async function saveAvailability() {
    try {
      setSaving(true);
      await api.patch('/specialists/me', {
        availability: { days, start, end },
      });

      Alert.alert('Listo', 'Disponibilidad actualizada.');
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la disponibilidad.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSpecialties() {
    try {
      setSaving(true);
      const cleaned = Array.from(
        new Set(
          specialties
            .map((s) => (s === 'plomeria' ? 'plomeria-gasista' : s))
            .filter((s) => !HIDDEN_SPECIALTIES.has(s)),
        ),
      );

      await api.patch('/specialists/specialties', { specialties: cleaned });

      Alert.alert('Listo', 'Rubros actualizados.');
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'No se pudieron actualizar los rubros.';
      Alert.alert('Ups', String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function savePriceAndRadius() {
    try {
      setSaving(true);

      const visitPrice = Math.max(0, Math.floor(Number(price) || 0));
      const radiusKm = Math.max(0, Number(radius) || 0);

      const label = pricingLabel.trim();
      const pricingLabelSafe = label.length ? label.slice(0, 40) : null;

      await api.patch('/specialists/me', { visitPrice, radiusKm, pricingLabel: pricingLabelSafe });

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              visitPrice,
              radiusKm,
              pricingLabel: pricingLabelSafe,
            }
          : prev,
      );

      Alert.alert('Listo', 'Tarifa, etiqueta y radio actualizados.');
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la tarifa/radio.');
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(idx: number) {
    setDays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()));
  }
  function toggleSpecialty(slug: string) {
    setSpecialties((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function sameStringSet(a: string[], b: string[]) {
    const aa = Array.from(new Set(a)).sort();
    const bb = Array.from(new Set(b)).sort();
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
    return true;
  }

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  function renderSubscriptionMainText(sub: SubscriptionInfo) {
    if (sub.status === 'TRIALING') {
      if (typeof sub.daysRemaining === 'number') {
        if (sub.daysRemaining <= 0) return 'Tu prueba termina hoy.';
        if (sub.daysRemaining === 1) return 'Te queda 1 día de prueba gratuita como especialista.';
        return `Te quedan ${sub.daysRemaining} días de prueba gratuita como especialista.`;
      }
      return 'Tenés una prueba gratuita activa como especialista.';
    }
    if (sub.status === 'ACTIVE') {
      return 'Tu suscripción está activa. Seguís apareciendo en las búsquedas y podés recibir nuevos trabajos.';
    }
    if (sub.status === 'PAST_DUE') return 'Tu suscripción tiene un pago pendiente.';
    return 'Tu suscripción está inactiva.';
  }

  function certStatusBadge(status?: CertItem['status']) {
    switch (status) {
      case 'APPROVED':
        return { bg: 'rgba(0,160,120,0.18)', txt: '#8EF0CF', label: 'Aprobada' };
      case 'REJECTED':
        return { bg: 'rgba(240,50,60,0.18)', txt: '#FFC7CD', label: 'Rechazada' };
      default:
        return { bg: 'rgba(240,200,60,0.18)', txt: '#FFE8A3', label: 'Pendiente' };
    }
  }
  function findCert(slug: string) {
    return certs.find((c) => c.category.slug === slug);
  }

  function handleUploadCert(categorySlug: string) {
    Alert.alert(
      'Subir matrícula',
      'Elegí el tipo de archivo',
      [
        {
          text: 'Imagen (Galería)',
          onPress: async () => {
            try {
              setCertLoading(categorySlug, true);

              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 1,
                allowsEditing: true,
                aspect: [4, 3],
              });
              if (res.canceled || !res.assets?.[0]?.uri) return;

              const relativeUrl = await uploadCertificationFile(res.assets[0].uri);
              await upsertCertification({ categorySlug, fileUrl: relativeUrl });

              const items = await listCertifications();
              setCerts(items);
              Alert.alert('Listo', 'Matrícula subida y enviada a revisión.');
            } catch (e) {
              if (__DEV__) console.log('[handleUploadCert:image] error', e);
              Alert.alert('Ups', 'No se pudo subir la matrícula.');
            } finally {
              setCertLoading(categorySlug, false);
            }
          },
        },
        {
          text: 'Documento (PDF)',
          onPress: async () => {
            try {
              setCertLoading(categorySlug, true);

              const doc = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf'],
                copyToCacheDirectory: true,
                multiple: false,
              });

              if (doc.canceled) return;
              const asset = doc.assets?.[0];
              if (!asset?.uri) return;

              const relativeUrl = await uploadCertificationAnyFile(
                asset.uri,
                asset.name ?? 'cert.pdf',
              );

              await upsertCertification({ categorySlug, fileUrl: relativeUrl });

              const items = await listCertifications();
              setCerts(items);
              Alert.alert('Listo', 'Documento subido y enviado a revisión.');
            } catch (e) {
              if (__DEV__) console.log('[handleUploadCert:pdf] error', e);
              Alert.alert('Ups', 'No se pudo subir el documento.');
            } finally {
              setCertLoading(categorySlug, false);
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  const chipSource: { slug: string; name: string }[] = useMemo(() => {
    if (categoryOptions.length) {
      return categoryOptions
        .filter((c) => !HIDDEN_SPECIALTIES.has(c.slug))
        .map((c) => ({ slug: c.slug, name: c.name }));
    }

    return (SPECIALTY_OPTIONS as readonly string[])
      .filter((s) => !HIDDEN_SPECIALTIES.has(s))
      .map((s) => ({ slug: s, name: s }));
  }, [categoryOptions]);

  const specialtiesRequiringCert = useMemo(
    () => specialties.filter((s) => requiresCert(s)),
    [specialties, requiresCert],
  );

  useEffect(() => {
    if (!__DEV__) return;

    console.log('[DEBUG] categoryOptions.length:', categoryOptions.length);
    console.log('[DEBUG] specialties:', specialties);
    console.log('[DEBUG] specialtiesRequiringCert:', specialtiesRequiringCert);

    // probá 2-3 slugs típicos del usuario
    for (const s of specialties.slice(0, 6)) {
      const fromApi = categoryOptions.find((c) => c.slug === s)?.requiresCertification;
      console.log(`[DEBUG] requiresCert("${s}") =>`, requiresCert(s), 'fromApi:', fromApi);
    }
  }, [categoryOptions, specialties, specialtiesRequiringCert, requiresCert]);

  const bioDirty = useMemo(() => {
    return bio !== bioSnapRef.current;
  }, [bio]);

  const availabilityDirty = useMemo(() => {
    const current = JSON.stringify({ days, start, end });
    return current !== availabilitySnapRef.current;
  }, [days, start, end]);

  const priceRadiusDirty = useMemo(() => {
    const current = JSON.stringify({
      visitPrice: Math.max(0, Math.floor(Number(price) || 0)),
      radiusKm: Math.max(0, Number(radius) || 0),
      pricingLabel: pricingLabel.trim(),
    });
    return current !== priceRadiusSnapRef.current;
  }, [price, radius, pricingLabel]);

  const specialtiesDirty = useMemo(() => {
    const cleaned = Array.from(
      new Set(
        specialties
          .map((s) => (s === 'plomeria' ? 'plomeria-gasista' : s))
          .filter((s) => !HIDDEN_SPECIALTIES.has(s)),
      ),
    );
    const base = JSON.parse(specialtiesSnapRef.current || '[]') as string[];
    return !sameStringSet(cleaned, base);
  }, [specialties]);

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          edges={['top']}
        >
          <ActivityIndicator color="#E9FEFF" />
          <Text style={{ color: '#E9FEFF', marginTop: 10, fontWeight: '800' }}>
            Cargando tu panel…
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header centrado */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerSpacer} />
          <View style={styles.brandCentered}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>Solucity</Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={26} color="#E9FEFF" />
            {unread > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Resumen + avatar */}
          <View style={styles.cardRow}>
            <View style={styles.avatarBlock}>
              <View style={styles.avatarWrap}>
                <Image source={avatarSrc} style={styles.avatar} />
              </View>
              <Pressable style={styles.camFab} onPress={() => setPickerOpen(true)}>
                <Ionicons name="camera" size={18} color="#0A5B63" />
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {profile?.name || 'Especialista'}
              </Text>

              {/* ⭐ Rating */}
              <View style={styles.starsRow}>
                {(() => {
                  const avg =
                    profile?.ratingAvg != null && !Number.isNaN(profile.ratingAvg)
                      ? profile.ratingAvg
                      : reviews.length
                        ? reviews.reduce((acc, r) => acc + r.score, 0) / reviews.length
                        : 0;

                  const count = profile?.ratingCount != null ? profile.ratingCount : reviews.length;

                  return (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Ionicons
                          key={i}
                          name="star"
                          size={16}
                          color={i <= Math.round(avg) ? '#FFD166' : '#4C7E84'}
                        />
                      ))}
                      <Text style={styles.muted}> — ({count || 0})</Text>
                    </>
                  );
                })()}
              </View>

              {profile?.kycStatus ? (
                <Pressable
                  onPress={() => (navigation as any).navigate('KycStatus')}
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.10)',
                    borderWidth: 1,
                    borderColor: 'rgba(233,254,255,0.18)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#E9FEFF" />
                    <Text style={{ color: '#E9FEFF', fontWeight: '800', flex: 1 }}>
                      {profile.kycStatus === 'VERIFIED'
                        ? 'KYC verificado ✅'
                        : profile.kycStatus === 'PENDING'
                          ? 'KYC en revisión'
                          : profile.kycStatus === 'REJECTED'
                            ? 'KYC rechazado — reenviar'
                            : 'KYC pendiente — completar'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#E9FEFF" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Tarjeta suscripción */}
          {subscription ? (
            <Pressable
              onPress={() => (navigation as any).navigate('Subscription')}
              style={[styles.card, styles.subCard]}
            >
              <View style={styles.subHeaderRow}>
                <View style={styles.subPill}>
                  <Text style={styles.subPillText}>
                    {subscription.status === 'TRIALING'
                      ? 'Período de prueba'
                      : subscription.status === 'ACTIVE'
                        ? 'Suscripción activa'
                        : subscription.status === 'PAST_DUE'
                          ? 'Pago pendiente'
                          : 'Suscripción inactiva'}
                  </Text>
                </View>

                <Ionicons
                  name={subscription.status === 'ACTIVE' ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color="#E9FEFF"
                />
              </View>

              <Text style={styles.subMainText}>{renderSubscriptionMainText(subscription)}</Text>

              {subscription.status === 'TRIALING' &&
              typeof subscription.daysRemaining === 'number' ? (
                <Text style={styles.subSecondaryText}>
                  Te quedan{' '}
                  <Text style={styles.subDaysHighlight}>
                    {subscription.daysRemaining <= 0
                      ? 'menos de 1 día'
                      : `${subscription.daysRemaining} días`}
                  </Text>{' '}
                  de prueba gratuita.
                </Text>
              ) : null}

              {subscription.status === 'ACTIVE' && subscription.currentPeriodEnd ? (
                <Text style={styles.subSecondaryText}>
                  Próxima renovación: {formatDate(subscription.currentPeriodEnd)}
                </Text>
              ) : null}

              {/* ✅ CTA cuando hace falta pagar / activar */}
              {subscription.status !== 'ACTIVE' ? (
                <View style={{ marginTop: 10 }}>
                  <View
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 226, 155, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 226, 155, 0.25)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ color: '#FFE29B', fontWeight: '900', flex: 1 }}>
                      {subscription.status === 'TRIALING'
                        ? 'Activá tu suscripción para seguir recibiendo trabajos.'
                        : subscription.status === 'PAST_DUE'
                          ? 'Tenés un pago pendiente. Tocá para regularizar.'
                          : 'Tu suscripción está inactiva. Tocá para activarla.'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#FFE29B" />
                  </View>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {/* Estado */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Estado</Text>
              <View style={[styles.badge, visibleEffective ? styles.badgeOn : styles.badgeOff]}>
                <View style={[styles.dot, visibleEffective ? styles.dotOn : styles.dotOff]} />
                <Text style={[styles.badgeT, { color: visibleEffective ? '#063A40' : '#6F8C90' }]}>
                  {visibleEffective ? 'Disponible' : 'No disponible'}
                </Text>
              </View>
            </View>
            <View style={styles.stateRow}>
              <Text style={styles.label}>Habilitar disponibilidad</Text>
              <Switch
                value={availableNow}
                onValueChange={toggleAvailable}
                disabled={!canToggleAvailability}
              />
            </View>
            {!canToggleAvailability ? (
              <Text style={[styles.muted, { marginTop: 6 }]}>
                {!subscriptionOk
                  ? 'Tu disponibilidad requiere suscripción activa. Tocá la tarjeta de Suscripción para activarla.'
                  : 'Tu disponibilidad se habilita cuando validemos tú identidad y el certificado de buena conducta esté aprobado.'}
              </Text>
            ) : null}

            {!subscriptionOk ? (
              <Pressable
                onPress={() => (navigation as any).navigate('Subscription')}
                style={[
                  styles.btn,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: '#FFE29B',
                    marginTop: 10,
                  },
                ]}
              >
                <Text style={[styles.btnT, { color: '#FFE29B' }]}>Activar suscripción</Text>
              </Pressable>
            ) : null}

            <View style={{ marginTop: 10 }}>
              <Pressable
                onPress={() => {
                  // 1) Primero aseguramos que el stack Perfil tenga ProfileMain
                  (navigation as any).navigate('Perfil', { screen: 'ProfileMain' });

                  // 2) Luego empujamos BackgroundCheck arriba (crea historial)
                  setTimeout(() => {
                    (navigation as any).navigate('Perfil', { screen: 'BackgroundCheck' });
                  }, 0);
                }}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(233,254,255,0.18)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Ionicons name="document-text-outline" size={18} color="#E9FEFF" />
                  <Text style={{ color: '#E9FEFF', fontWeight: '800', flex: 1 }}>
                    Certificado de buena conducta:{' '}
                    {bgStatus === 'APPROVED'
                      ? 'Aprobado ✅'
                      : bgStatus === 'PENDING'
                        ? 'En revisión'
                        : bgStatus === 'REJECTED'
                          ? 'Rechazado'
                          : 'No cargado'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#E9FEFF" />
              </Pressable>

              {bgStatus === 'REJECTED' && profile?.backgroundCheck?.rejectionReason ? (
                <Text style={[styles.muted, { marginTop: 8 }]}>
                  Motivo: {profile.backgroundCheck.rejectionReason}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Contrataciones */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contrataciones</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="checkmark-circle-outline" size={26} color="#E9FEFF" />
                <Text style={styles.statNumber}>{statsDone}</Text>
                <Text style={styles.statLabel}>Realizados</Text>
              </View>

              <View style={styles.statBox}>
                <Ionicons name="close-circle-outline" size={26} color="#E9FEFF" />
                <Text style={styles.statNumber}>{statsCanceled}</Text>
                <Text style={styles.statLabel}>Cancelados</Text>
              </View>
            </View>
          </View>

          {/* Tu perfil */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tu perfil</Text>
            <Text style={styles.subTitle}>Biografía</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Contanos sobre tu experiencia…"
              placeholderTextColor="#9ec9cd"
              multiline
              style={[styles.input, { minHeight: 110 }]}
            />
            <Pressable
              onPress={saveBio}
              disabled={!bioDirty || saving}
              style={[styles.btn, (!bioDirty || saving) && styles.btnDisabled]}
            >
              <Text style={styles.btnT}>Guardar biografía</Text>
            </Pressable>
          </View>

          {/* Disponibilidad */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Disponibilidad</Text>

            <Text style={styles.subTitle}>Días</Text>
            <View style={styles.daysRow}>
              {DAY_LABELS.map((d, idx) => {
                const on = days.includes(idx);
                return (
                  <Pressable
                    key={d}
                    onPress={() => toggleDay(idx)}
                    style={[styles.dayChip, on ? styles.dayOn : styles.dayOff]}
                  >
                    <Text style={[styles.dayT, { color: on ? '#063A40' : '#9ec9cd' }]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subTitle, { marginTop: 10 }]}>Horario</Text>
            <View style={styles.timeRow}>
              <Pressable
                style={[styles.input, styles.timeInput]}
                onPress={() => setShowStartPicker(true)}
              >
                <Text style={{ color: '#E9FEFF', textAlign: 'center', fontWeight: '800' }}>
                  {start || '09:00'}
                </Text>
              </Pressable>

              <Text style={[styles.muted, { marginHorizontal: 6 }]}>a</Text>

              <Pressable
                style={[styles.input, styles.timeInput]}
                onPress={() => setShowEndPicker(true)}
              >
                <Text style={{ color: '#E9FEFF', textAlign: 'center', fontWeight: '800' }}>
                  {end || '18:00'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={saveAvailability}
              disabled={!availabilityDirty || saving}
              style={[styles.btn, (!availabilityDirty || saving) && styles.btnDisabled]}
            >
              <Text style={styles.btnT}>Guardar disponibilidad</Text>
            </Pressable>
          </View>

          {/* Cobertura y tarifa */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cobertura y tarifa</Text>

            <Text style={styles.subTitle}>Precio (general)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#9ec9cd"
              style={styles.input}
            />

            <Text style={[styles.subTitle, { marginTop: 10 }]}>Etiqueta del precio</Text>
            <TextInput
              value={pricingLabel}
              onChangeText={setPricingLabel}
              placeholder="Ej: Por visita, Por hora, Presupuesto"
              placeholderTextColor="#9ec9cd"
              style={styles.input}
              maxLength={40}
            />
            <Text style={styles.muted}>
              Esto se muestra en el listado como “Etiqueta: $precio”. (Máx. 40 caracteres)
            </Text>

            <Text style={[styles.subTitle, { marginTop: 10 }]}>Radio de trabajo (km)</Text>
            <TextInput
              value={radius}
              onChangeText={setRadius}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor="#9ec9cd"
              style={styles.input}
            />
            <Text style={styles.muted}>Distancia máxima desde tu zona de cobertura.</Text>

            <Pressable
              onPress={savePriceAndRadius}
              disabled={!priceRadiusDirty || saving}
              style={[styles.btn, (!priceRadiusDirty || saving) && styles.btnDisabled]}
            >
              <Text style={styles.btnT}>Guardar tarifa y radio</Text>
            </Pressable>

            <Pressable
              onPress={() => updateLocationFromDevice({ silent: false })}
              style={[
                styles.btn,
                {
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: '#E9FEFF',
                  marginTop: 8,
                },
                saving && styles.btnDisabled,
              ]}
            >
              <Text style={[styles.btnT, { color: '#E9FEFF' }]}>Usar mi ubicación actual</Text>
            </Pressable>
          </View>

          {/* Rubros */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Rubros</Text>
              <Text style={styles.muted}>{specialties.length} seleccionados</Text>
            </View>

            <View style={styles.chipsWrap}>
              {chipSource.map((opt) => {
                const on = specialties.includes(opt.slug);
                return (
                  <Pressable
                    key={opt.slug}
                    onPress={() => toggleSpecialty(opt.slug)}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  >
                    <Text style={[styles.chipT, { color: on ? '#063A40' : '#9ec9cd' }]}>
                      {opt.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={saveSpecialties}
              disabled={!specialtiesDirty || saving}
              style={[styles.btn, (!specialtiesDirty || saving) && styles.btnDisabled]}
            >
              <Text style={styles.btnT}>Guardar rubros</Text>
            </Pressable>
          </View>

          {/* Matrículas */}
          <Section
            title="Matrículas por rubro"
            open={openCerts}
            onToggle={() => setOpenCerts((v) => !v)}
          >
            {specialtiesRequiringCert.length ? (
              <View style={{ gap: 10 }}>
                {specialtiesRequiringCert.map((slug) => {
                  const c = findCert(slug);
                  const badge = certStatusBadge(c?.status);
                  const uploading = isCertLoading(slug);

                  return (
                    <View key={slug} style={styles.certItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>{catNameBySlug(slug)}</Text>
                        <Text style={styles.muted} numberOfLines={1}>
                          {maskedCertRowText(c)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.badgeT, { color: badge.txt }]}>{badge.label}</Text>
                        </View>

                        <Pressable
                          style={[styles.smallBtn, uploading && { opacity: 0.6 }]}
                          onPress={() => handleUploadCert(slug)}
                          disabled={uploading}
                        >
                          <Text style={styles.smallBtnT}>
                            {uploading ? 'Subiendo…' : c ? 'Actualizar' : 'Subir'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.muted}>
                Ninguno de tus rubros seleccionados requiere matrícula.
              </Text>
            )}
          </Section>

          {/* Reseñas */}
          <View style={styles.card}>
            <View style={[styles.cardHeaderRow, { marginBottom: 0 }]}>
              <Text style={styles.cardTitle}>Reseñas</Text>
              <Pressable onPress={loadReviews} style={{ padding: 6, opacity: 0.9 }}>
                <Ionicons name="refresh" size={18} color="#E9FEFF" />
              </Pressable>
            </View>

            {reviewsLoading ? (
              <View style={{ paddingVertical: 10 }}>
                <ActivityIndicator color="#E9FEFF" />
                <Text style={[styles.muted, { marginTop: 8 }]}>Cargando reseñas…</Text>
              </View>
            ) : reviews.length === 0 ? (
              <Text style={styles.muted}>Aún no tenés reseñas.</Text>
            ) : (
              <View style={{ marginTop: 8, gap: 10 }}>
                {reviews.map((r) => (
                  <View key={r.id} style={styles.reviewItem}>
                    <View style={styles.reviewHeaderRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Ionicons
                            key={i}
                            name="star"
                            size={14}
                            color={i <= Math.round(r.score) ? '#FFD166' : '#4C7E84'}
                          />
                        ))}
                        <Text style={[styles.muted, { marginLeft: 4, fontSize: 12 }]}>
                          {r.score.toFixed(1)} / 5
                        </Text>
                      </View>

                      <Text style={styles.reviewMeta} numberOfLines={1}>
                        {r.customerName} · {formatDate(r.createdAt)}
                      </Text>
                    </View>

                    {r.comment ? (
                      <Text style={styles.reviewComment} numberOfLines={3}>
                        “{r.comment}”
                      </Text>
                    ) : (
                      <Text style={styles.reviewComment}>
                        El cliente calificó con {r.score.toFixed(1)} estrellas.
                      </Text>
                    )}

                    <Text style={styles.reviewService} numberOfLines={1}>
                      {r.serviceName}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Pickers: hora */}
      {showStartPicker && (
        <DateTimePicker
          value={timeStringToDate(start)}
          mode="time"
          is24Hour
          onChange={(_, d) => {
            setShowStartPicker(false);
            if (d) setStart(dateToTimeString(d));
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={timeStringToDate(end)}
          mode="time"
          is24Hour
          onChange={(_, d) => {
            setShowEndPicker(false);
            if (d) setEnd(dateToTimeString(d));
          }}
        />
      )}

      {/* Modal: elegir origen foto */}
      <Modal
        transparent
        visible={pickerOpen}
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBG} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.modalBtn} onPress={openCamera}>
              <Ionicons name="camera" size={20} color="#0A5B63" />
              <Text style={styles.modalBtnT}>Sacar foto</Text>
            </Pressable>
            <Pressable style={styles.modalBtn} onPress={openGallery}>
              <Ionicons name="image" size={20} color="#0A5B63" />
              <Text style={styles.modalBtnT}>Elegir de galería</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Modal: preview + confirmar */}
      <Modal
        transparent
        visible={previewOpen}
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.previewBG}>
          <View style={styles.previewCard}>
            {localUri ? <Image source={{ uri: localUri }} style={styles.previewImg} /> : null}
            <View style={styles.previewRow}>
              <Pressable
                style={[styles.btn, { flex: 1, backgroundColor: 'rgba(10,91,99,0.12)' }]}
                onPress={() => {
                  setPreviewOpen(false);
                  setLocalUri(null);
                }}
              >
                <Text style={[styles.btnT, { color: '#0A5B63' }]}>Cancelar</Text>
              </Pressable>
              <View style={{ width: 10 }} />
              <Pressable
                style={[styles.btn, { flex: 1 }]}
                disabled={saving}
                onPress={confirmAvatar}
              >
                <Text style={styles.btnT}>{saving ? 'Subiendo…' : 'Usar foto'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const AVATAR = 118;

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 26 },
  brandCentered: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 28, height: 28 },
  brandText: { color: '#E9FEFF', fontWeight: '900', fontSize: 24, letterSpacing: 0.5 },

  bellBtn: { position: 'relative', padding: 4 },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#ff3b30',
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.28)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  cardRow: {
    backgroundColor: 'rgba(0, 35, 40, 0.28)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: { fontWeight: '800', color: '#E9FEFF', fontSize: 16 },

  subCard: {
    backgroundColor: 'rgba(3, 55, 63, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.18)',
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  subPillText: { color: '#E9FEFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  subMainText: { color: '#E9FEFF', fontSize: 14, fontWeight: '500', marginTop: 2 },
  subSecondaryText: { color: '#B5DADD', fontSize: 13, marginTop: 4 },
  subDaysHighlight: { fontWeight: '800', color: '#FFE29B' },

  name: { color: '#E9FEFF', fontWeight: '900', fontSize: 18, lineHeight: 22 },
  subTitle: { color: '#E9FEFF', fontWeight: '700', marginTop: 8, marginBottom: 6 },
  muted: { color: '#9ec9cd' },

  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeOn: { backgroundColor: 'rgba(233,254,255,0.9)' },
  badgeOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  badgeT: { fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#1ec9a3' },
  dotOff: { backgroundColor: '#6F8C90' },

  label: { color: '#E9FEFF', fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E9FEFF',
    marginTop: 8,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  timeInput: { flex: 1, justifyContent: 'center' },

  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  btnT: { color: '#0A5B63', fontWeight: '900' },
  btnDisabled: { opacity: 0.6 },

  avatarBlock: { width: AVATAR + 22, alignItems: 'center' },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    backgroundColor: '#0b4e57',
    borderWidth: 3,
    borderColor: 'rgba(233,254,255,0.35)',
  },
  avatar: { width: '100%', height: '100%' },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },

  camFab: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A5B63',
    elevation: 2,
    zIndex: 2,
  },

  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: 'rgba(233,254,255,0.9)' },
  dayOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  dayT: { fontWeight: '900' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  chipOn: { backgroundColor: 'rgba(233,254,255,0.9)' },
  chipOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  chipT: { fontWeight: '800' },

  sectionHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  certItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  smallBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnT: { color: '#0A5B63', fontWeight: '900' },

  modalBG: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: { backgroundColor: '#E9FEFF', borderRadius: 16, padding: 16, minWidth: 240 },
  modalBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  modalBtnT: { color: '#0A5B63', fontWeight: '800' },

  previewBG: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 24,
    justifyContent: 'center',
  },
  previewCard: { backgroundColor: '#E9FEFF', borderRadius: 16, padding: 14 },
  previewImg: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#ddd' },
  previewRow: { flexDirection: 'row', marginTop: 12 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,45,52,0.9)',
    alignItems: 'center',
    gap: 4,
  },
  statNumber: { color: '#E9FEFF', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#B9E2E5', fontSize: 13 },

  reviewItem: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(233,254,255,0.1)',
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reviewMeta: { color: '#9ec9cd', fontSize: 11, marginLeft: 8, flexShrink: 1, textAlign: 'right' },
  reviewComment: { color: '#E9FEFF', fontSize: 13, marginTop: 2 },
  reviewService: { color: '#9ec9cd', fontSize: 11, marginTop: 4 },
});
