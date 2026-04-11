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
  Animated,
  Easing,
  Image,
  InteractionManager,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import AppLogo from '../components/AppLogo';
import { LOCALITIES_CORDOBA } from '../data/localitiesCordoba';
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

  // ✅ NUEVO: especificación corta del rubro (headline)
  specialtyHeadline?: string | null;

  pricingLabel?: string | null;

  availability: {
    days: number[];
    start?: string;
    end?: string;
    ranges?: { start: string; end: string }[];
    mode?: 'single' | 'split' | 'allday';
    enabled?: boolean;
  };
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
  businessName?: string | null; // ✅ NUEVO: nombre de empresa/local/pyme (visible al cliente)
  officeAddress?: {
    id: string;
    formatted: string;
    lat?: number | null;
    lng?: number | null;
    placeId?: string | null;
  } | null;
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

type PortfolioItem = {
  id: string;
  imageUrl: string;
  thumbUrl?: string | null;
  caption?: string | null;
  sortOrder: number;
  createdAt: string;
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
  'plomeria',
  'plomeria-gasista',
  'pintura',
  'jardineria',
  'piscinas',
  'desagote-y-banos-quimicos',
  'soldador',
  'porcelanato-liquido',
  'vidrieria',
  'aberturas',
  'impermeabilizacion',
  'zingueria',
  'tapizado',

  // ── Informática & Electrónica ─────────────────────────────
  'climatizacion',
  'refrigeracion',
  'carteleria',
  'servicio-tecnico-electronica',
  'reparacion-de-celulares',
  'servicio-tecnico-electrodomesticos',
  'servicio-tecnico-audiovisual',
  'servicio-tecnico-informatica',

  // ── Seguridad ─────────────────────────────────────────────
  'camaras-y-alarmas',
  'cerrajeria',
  'personal-de-seguridad',
  'cercos-electricos-perimetrales',

  // ── Servicios ─────────────────────────────────────────────
  'limpieza',
  'clases-particulares',
  'paseador-de-perros',
  'cuidado-de-mascotas',
  'diseno-de-interiores',
  'organizacion-de-eventos',
  'fotografia-y-video',
  'atencion-al-cliente',
  'lavanderia',

  // ── Salud ─────────────────────────────────────────────────
  'acompanante-terapeutico',
  'psicologo',
  'psiquiatra',
  'asistencia-medica',
  'nutricionista',
  'psicopedagoga',
  'kinesiologia',
  'cuidador-de-pacientes',

  // ── Holístico y bienestar ─────────────────────────────────
  'reiki',
  'yoga',
  'meditacion-guiada',
  'terapias-holisticas',
  'masajes-holisticos',

  // ── Digital ───────────────────────────────────────────────
  'marketing-digital',
  'diseno-grafico',
  'diseno-de-logos',
  'community-manager',
  'desarrollo-web',
  'registro-de-marcas',

  // ── Profesionales ─────────────────────────────────────────
  'abogado',
  'contador',
  'escribano',
  'arquitecto',
  'ingeniero',
  'pas-productor-asesor-de-seguros',
  'mandatario-del-automotor',

  // ── Estética ──────────────────────────────────────────────
  'peluqueria',
  'barberia',
  'manicuria-unas',
  'maquillaje',
  'depilacion',
  'cosmetologia',
  'masajes',
  'spa-estetica-corporal',
  'cejas-y-pestanas',
  'tatuajes',
  'piercing',

  // ── Transporte ────────────────────────────────────────────
  'traslado-de-pasajeros',
  'chofer-particular',
  'fletes',
  'auxilio-vehicular',
  'reparacion-de-bicicletas',
  'mecanico-automotor',
  'electricidad-del-automotor',
  'mecanica-de-motos',
  'gomeria',
  'car-detailing',
  'lavadero-de-autos',

  // ── Arreglos y reparaciones ───────────────────────────────
  'reparacion-de-calzado',
  'arreglos-de-indumentaria',
  'costura-modista',

  // ── Alquiler ─────────────────────────────────────────────
  'alquiler-de-herramientas',
  'alquiler-de-maquinaria-liviana',
  'alquiler-de-maquinaria-pesada',
  'alquiler-de-generadores',
  'alquiler-de-andamios',
  'alquiler-de-hidrolavadoras',
  'alquiler-de-hormigoneras',
  'alquiler-de-elevadores',
  'alquiler-de-equipos-de-sonido-e-iluminacion',
  'alquiler-de-carpas-y-mobiliario',
] as const;

const REQUIRES_CERT_FALLBACK = new Set([
  // Construcción
  'electricidad',
  'plomeria',
  'plomeria-gasista',
  'desagote-y-banos-quimicos',

  // Informática y electrónica
  'climatizacion',
  'refrigeracion',
  'servicio-tecnico-electronica',
  'servicio-tecnico-electrodomesticos',
  'servicio-tecnico-informatica',
  'servicio-tecnico-audiovisual',

  // Seguridad
  'camaras-y-alarmas',
  'cerrajeria',
  'personal-de-seguridad',
  'cercos-electricos-perimetrales',

  // Servicios
  'diseno-de-interiores',

  // Salud
  'acompanante-terapeutico',
  'psicologo',
  'psiquiatra',
  'asistencia-medica',
  'nutricionista',
  'psicopedagoga',
  'kinesiologia',
  'cuidador-de-pacientes',

  // Profesionales
  'abogado',
  'contador',
  'escribano',
  'arquitecto',
  'ingeniero',
  'pas-productor-asesor-de-seguros',
  'mandatario-del-automotor',

  // Consultoria y desarrollo personal
  'asesor-empresarial',
  'coach-ejecutivo',
  'coach-organizacional',
  'coach-ontologico',
  'mentoria',
  'consultor-de-negocios',

  // Transporte
  'fletes',
  'traslado-de-pasajeros',
  'chofer-particular',
  'auxilio-vehicular',
]);

// 🔒 Rubros legacy que queremos ocultar SOLO en SpecialistHome
const HIDDEN_SPECIALTIES = new Set<string>([]);

// ✅ Normaliza modos (legacy-safe): casing, espacios, duplicados y valores inválidos
function normalizeModes(input: any): ('HOME' | 'OFFICE' | 'ONLINE')[] {
  const allowed = new Set(['HOME', 'OFFICE', 'ONLINE']);
  const raw = Array.isArray(input) ? input : [];

  const out = Array.from(
    new Set(
      raw
        .map((x) =>
          String(x ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((x) => allowed.has(x)),
    ),
  ).sort();

  return out as ('HOME' | 'OFFICE' | 'ONLINE')[];
}

// ✅ Extrae solo "Calle y número" aunque venga "Calle 123, Ciudad..."
function streetOnly(s: string) {
  return String(s ?? '')
    .split(',')[0]
    .trim();
}

function extractOfficeLocalityFromFormatted(formatted?: string | null) {
  const normalize = (s: string) =>
    String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const parts = String(formatted ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  if (!parts.length) return 'Río Cuarto';

  const candidates = parts.slice(1).filter((part) => {
    const n = normalize(part);
    return !!n && n !== 'cordoba' && n !== 'argentina';
  });

  for (const part of candidates) {
    const normalizedPart = normalize(part);

    const match = LOCALITIES_CORDOBA.find((loc) => {
      const normalizedLoc = normalize(loc);
      return normalizedPart.includes(normalizedLoc) || normalizedLoc.includes(normalizedPart);
    });

    if (match) return match;
  }

  return 'Río Cuarto';
}

// ✅ Snapshot estable para evitar "a veces" (mismos criterios en baseline y dirty)
function serviceModesSnapshot(modes: any, officeAddr: string, locality: string): string {
  const normalized = normalizeModes(modes);
  const hasOffice = normalized.includes('OFFICE');

  return JSON.stringify({
    serviceModes: normalized,
    officeAddress: hasOffice ? streetOnly(officeAddr) : '',
    officeLocality: hasOffice ? String(locality ?? '').trim() : '',
  });
}

function isWithinAvailability(av?: {
  days?: number[];
  start?: string;
  end?: string;
  ranges?: { start: string; end: string }[];
}) {
  if (!av) return true;

  const days = Array.isArray(av.days) ? av.days : [1, 2, 3, 4, 5];

  const ranges =
    Array.isArray(av.ranges) && av.ranges.length > 0
      ? av.ranges
      : av.start && av.end
        ? [{ start: av.start, end: av.end }]
        : [];

  const now = new Date();
  const day = now.getDay(); // 0..6 (D..S)
  if (!days.includes(day)) return false;

  if (!ranges.length) return true;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const range of ranges) {
    const [sh, sm] = String(range.start)
      .split(':')
      .map((n) => Number(n));
    const [eh, em] = String(range.end)
      .split(':')
      .map((n) => Number(n));

    const startMin = (sh || 0) * 60 + (sm || 0);
    const endMin = (eh || 0) * 60 + (em || 0);

    if (startMin === endMin) return true;

    if (endMin >= startMin) {
      if (nowMin >= startMin && nowMin <= endMin) return true;
    } else {
      if (nowMin >= startMin || nowMin <= endMin) return true;
    }
  }

  return false;
}

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const IS_WEB = Platform.OS === 'web';

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
  const { unread, webBannerVisible, webBannerCount, dismissWebBanner } = useNotifications();

  const handleOpenNotifications = useCallback(() => {
    dismissWebBanner();
    navigation.navigate('Notifications');
  }, [dismissWebBanner, navigation]);

  // auth (usamos any para no pelear con tipos viejos)
  const auth = useAuth() as any;
  const token: string | null = auth.token ?? null;
  const logout: (() => void) | undefined = auth.logout;
  const uid: string | null = auth?.user?.id ?? null;
  const currentMode: 'client' | 'specialist' = auth?.mode ?? 'specialist';
  const setAuthMode: ((mode: 'client' | 'specialist') => Promise<void>) | undefined = auth?.setMode;

  const performSwitchToClientMode = useCallback(async () => {
    try {
      setSwitchingMode('client');
      await new Promise((resolve) => setTimeout(resolve, 220));
      await setAuthMode?.('client');
    } catch (e) {
      if (__DEV__) console.log('[SpecialistHome] switch to client mode error', e);
      setSwitchingMode(null);

      if (Platform.OS === 'web') {
        window.alert('No pudimos cambiar de modo. Intentá nuevamente.');
      } else {
        Alert.alert('Ups', 'No pudimos cambiar de modo. Intentá nuevamente.');
      }
    }
  }, [setAuthMode]);

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

  const handleSwitchToClientMode = useCallback(() => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Vas a pasar al modo cliente para buscar y contratar especialistas. Después vas a poder volver al modo especialista.',
      );

      if (!confirmed) return;

      performSwitchToClientMode().catch(() => undefined);
      return;
    }

    Alert.alert(
      'Cambiar a modo cliente',
      'Vas a pasar al modo cliente para buscar y contratar especialistas. Después vas a poder volver al modo especialista.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: () => {
            performSwitchToClientMode().catch(() => undefined);
          },
        },
      ],
    );
  }, [performSwitchToClientMode]);
  // ✅ Loading real
  const [loading, setLoading] = useState(true);

  type SaveKey =
    | 'bio'
    | 'headline'
    | 'businessName'
    | 'availability'
    | 'priceRadius'
    | 'specialties'
    | 'location'
    | 'avatar'
    | 'serviceModes'
    | 'portfolio';

  const [savingBy, setSavingBy] = useState<Record<SaveKey, boolean>>({
    bio: false,
    headline: false,
    businessName: false,
    availability: false,
    priceRadius: false,
    specialties: false,
    location: false,
    avatar: false,
    serviceModes: false,
    portfolio: false,
  });

  const setSavingKey = useCallback((k: SaveKey, v: boolean) => {
    setSavingBy((prev) => ({ ...prev, [k]: v }));
  }, []);

  // ✅ Snapshots (baseline) para detectar cambios por bloque
  const bioSnapRef = useRef<string>('');
  const availabilitySnapRef = useRef<string>(''); // guardamos JSON string
  const priceRadiusSnapRef = useRef<string>(''); // guardamos JSON string
  const specialtiesSnapRef = useRef<string>(''); // guardamos JSON string
  const headlineSnapRef = useRef<string>(''); // ✅ snapshot especificación rubro
  const serviceModesSnapRef = useRef<string>(''); // ✅ snapshot modalidades + dirección/localidad
  const businessNameSnapRef = useRef<string>(''); // ✅ snapshot nombre del negocio

  const [profile, setProfile] = useState<SpecProfile | null>(null);

  // 🔥 Modalidad de servicio
  const [serviceModes, setServiceModes] = useState<('HOME' | 'OFFICE' | 'ONLINE')[]>([]);

  const [officeAddress, setOfficeAddress] = useState('');
  const [savedOfficeAddress, setSavedOfficeAddress] = useState('');

  // ✅ Localidad para oficina (opción B)
  const [officeLocality, setOfficeLocality] = useState('Río Cuarto');
  const [officeLocalityOpen, setOfficeLocalityOpen] = useState(false);
  const [officeLocalityQuery, setOfficeLocalityQuery] = useState('');

  // ✅ Copiamos el mismo filtrado que CreateOrder
  const filteredOfficeLocalities = useMemo(() => {
    const q = normalizeText(officeLocalityQuery);
    if (!q) return LOCALITIES_CORDOBA;

    return LOCALITIES_CORDOBA.filter((x) => normalizeText(x).includes(q));
  }, [officeLocalityQuery]);

  // avatar
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  // certificaciones
  const [certs, setCerts] = useState<CertItem[]>([]);
  const [certSavingBySlug, setCertSavingBySlug] = useState<Record<string, boolean>>({});
  const [openCerts, setOpenCerts] = useState(false);
  const [openPricing, setOpenPricing] = useState(false);
  const [openAvailability, setOpenAvailability] = useState(false);
  const [openPerfil, setOpenPerfil] = useState(false);
  const [openRubros, setOpenRubros] = useState(false);
  const [specialtyQuery, setSpecialtyQuery] = useState('');
  // ✅ Lazy-load certs (cargar solo al abrir el bloque la 1ra vez)
  const certsLoadedOnceRef = useRef(false);
  const [certsLoading, setCertsLoading] = useState(false);
  const [openServiceModes, setOpenServiceModes] = useState(false);

  const [missingModesModalOpen, setMissingModesModalOpen] = useState(false);
  const [homeBgRequiredModalOpen, setHomeBgRequiredModalOpen] = useState(false);

  // portfolio / trabajos realizados
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [portfolioPreviewOpen, setPortfolioPreviewOpen] = useState(false);
  const [portfolioPreviewUri, setPortfolioPreviewUri] = useState<string | null>(null);

  // ✅ NUEVO: preview antes de subir imagen de trabajo realizado
  const [portfolioUploadPreviewOpen, setPortfolioUploadPreviewOpen] = useState(false);
  const [portfolioLocalUri, setPortfolioLocalUri] = useState<string | null>(null);

  const portfolioLoadedOnceRef = useRef(false);

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
  // ✅ evita doble recarga (mount + focus inmediato)
  const didInitialLoadRef = useRef(false);

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

  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [activeOrdersLoading, setActiveOrdersLoading] = useState(false);

  // form fields
  const [bio, setBio] = useState('');
  const [headline, setHeadline] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [availableNow, setAvailableNow] = useState(true); // switch (intención)
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');

  const [splitStart, setSplitStart] = useState('09:00');
  const [splitEnd, setSplitEnd] = useState('13:00');
  const [splitStart2, setSplitStart2] = useState('16:00');
  const [splitEnd2, setSplitEnd2] = useState('20:00');

  const [availabilityMode, setAvailabilityMode] = useState<'single' | 'split' | 'allday'>('single');
  const [allDay, setAllDay] = useState(false);

  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [specialties, setSpecialties] = useState<string[]>([]);

  // ✅ pickers hora
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [showSplitStartPicker, setShowSplitStartPicker] = useState(false);
  const [showSplitEndPicker, setShowSplitEndPicker] = useState(false);
  const [showSplitStart2Picker, setShowSplitStart2Picker] = useState(false);
  const [showSplitEnd2Picker, setShowSplitEnd2Picker] = useState(false);

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
  const [radius, setRadius] = useState<string>('30');

  // etiqueta precio
  const [pricingLabel, setPricingLabel] = useState<string>('');

  // suscripción
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  const maxAllowedRadiusKm = useMemo(() => {
    return specialties.includes('auxilio-vehicular') ? 200 : 30;
  }, [specialties]);

  // ubicación: auto-update una sola vez, sin bloquear
  const locationRequestedRef = useRef(false);
  const locationAttemptRef = useRef(0);
  const locationRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ loading por rubro (solo el botón que se está subiendo)
  function setCertLoading(slug: string, v: boolean) {
    setCertSavingBySlug((prev) => ({ ...prev, [slug]: v }));
  }
  function isCertLoading(slug: string) {
    return !!certSavingBySlug[slug];
  }

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
      const found = categoryOptions.find((c) => c.slug === slug);

      // ✅ Si tenemos el rubro desde API, el backend manda la verdad absoluta
      if (found) return !!found.requiresCertification;

      // ✅ Solo si NO existe en API (ej: /categories falló o todavía no cargó)
      // usamos fallback local
      return REQUIRES_CERT_FALLBACK.has(slug);
    },
    [categoryOptions],
  );

  // ✅ Lazy-load certs (cargar solo al abrir el bloque la 1ra vez)
  const loadCertsOnce = useCallback(async () => {
    if (certsLoadedOnceRef.current) return;

    try {
      certsLoadedOnceRef.current = true;
      setCertsLoading(true);

      const items = await listCertifications();
      setCerts(items);
    } catch (e) {
      // si falla, permitimos reintento al volver a abrir
      certsLoadedOnceRef.current = false;
      if (__DEV__) console.log('[SpecialistHome] loadCertsOnce error', e);
    } finally {
      setCertsLoading(false);
    }
  }, []);

  const loadPortfolioOnce = useCallback(async () => {
    if (portfolioLoadedOnceRef.current) return;

    try {
      portfolioLoadedOnceRef.current = true;
      setPortfolioLoading(true);

      const { data } = await api.get('/specialists/me/portfolio', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      setPortfolio(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      portfolioLoadedOnceRef.current = false;
      if (__DEV__) console.log('[SpecialistHome] loadPortfolioOnce error', e);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  function normalizeSpecialties(input: any): string[] {
    if (!input) return [];
    if (!Array.isArray(input)) return [];

    if (input.every((x) => typeof x === 'string')) {
      const slugs = input.map((s) => s.trim()).filter(Boolean);
      return Array.from(new Set(slugs));
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

    return Array.from(new Set(slugs));
  }

  function toSlugLike(s: string) {
    return String(s)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/-+/g, '-');
  }

  function normalizeText(s: string) {
    return String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function getCategoryDisplayName(slug: string, fallbackName: string) {
    if (slug === 'plomeria') return 'Plomero';
    if (slug === 'plomeria-gasista') return 'Gasista';
    return fallbackName;
  }

  function catNameBySlug(slug: string) {
    const found = categoryOptions.find((c) => c.slug === slug);
    return getCategoryDisplayName(slug, found?.name ?? slug);
  }

  function portfolioImageSource(item: PortfolioItem) {
    return absoluteUrl(item.thumbUrl || item.imageUrl);
  }

  // Ubicación: pedir permisos, obtener coords y guardarlas (no bloqueante)
  const updateLocationFromDevice = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      const silent = options?.silent ?? true;

      try {
        if (!silent) setSavingKey('location', true);

        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          perm = await Location.requestForegroundPermissionsAsync();
        }

        if (perm.status !== 'granted') {
          if (!silent) {
            Alert.alert(
              'Permiso requerido',
              'Necesitamos acceder a tu ubicación para mostrarte en las búsquedas cercanas.',
            );
          }
          return false;
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

        return true; // ✅ FALTABA
      } catch (e) {
        if (__DEV__) console.log('[updateLocationFromDevice] error', e);
        if (!silent) {
          Alert.alert('Ups', 'No pudimos actualizar tu ubicación. Probá de nuevo más tarde.');
        }
        return false; // ✅ FALTABA
      } finally {
        if (!silent) setSavingKey('location', false);
      }
    },
    [uid, setSavingKey],
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
        // 🔥 Cargar modalidades del backend (normalizado: legacy-safe)
        setServiceModes(normalizeModes((p as any).serviceModes));

        // 🔥 Cargar dirección del local si existe (soporta string u objeto)
        const oa = p.officeAddress ?? null;
        const formatted = typeof oa?.formatted === 'string' ? oa.formatted : null;

        if (formatted) {
          const street = streetOnly(formatted);
          const parsedLocality = extractOfficeLocalityFromFormatted(formatted);

          setOfficeAddress(street);
          setSavedOfficeAddress(formatted);
          setOfficeLocality(parsedLocality);
        } else {
          setOfficeAddress('');
          setSavedOfficeAddress('');
          setOfficeLocality('Río Cuarto');
          setOfficeLocalityQuery('');
          setOfficeLocalityOpen(false);
        }

        // ✅ baseline Modalidad de servicio (snapshots)
        // OJO: acá NO usamos los states (porque setState es async), usamos variables locales.
        const modesBase = normalizeModes((p as any).serviceModes);

        let streetBase = '';
        let localityBase = 'Río Cuarto'; // mismo default que tu state inicial

        if (formatted) {
          streetBase = streetOnly(formatted);
          localityBase = extractOfficeLocalityFromFormatted(formatted);
        }

        // guardamos baseline consistente
        serviceModesSnapRef.current = serviceModesSnapshot(modesBase, streetBase, localityBase);

        setBio(p.bio ?? '');
        setHeadline((p.specialtyHeadline ?? '').trim());
        setBusinessName((p.businessName ?? '').trim());

        // si todavía no viene (backend viejo), fallback a p.available
        setAvailableNow(
          typeof (p as any).availableNow === 'boolean' ? (p as any).availableNow : !!p.available,
        );

        const avail = p.availability ?? {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '18:00',
        };

        const ranges =
          Array.isArray(avail.ranges) && avail.ranges.length > 0
            ? avail.ranges
            : avail.start && avail.end
              ? [{ start: avail.start, end: avail.end }]
              : [{ start: '09:00', end: '18:00' }];

        const firstRange = ranges[0] ?? { start: '09:00', end: '18:00' };
        const secondRange = ranges[1] ?? { start: '16:00', end: '20:00' };

        const isAllDay =
          ranges.length === 1 && firstRange.start === '00:00' && firstRange.end === '00:00';

        const mode: 'single' | 'split' | 'allday' = isAllDay
          ? 'allday'
          : ranges.length > 1
            ? 'split'
            : 'single';

        setDays(avail.days ?? [1, 2, 3, 4, 5]);
        setStart(firstRange.start ?? '09:00');
        setEnd(firstRange.end ?? '18:00');
        setSplitStart(firstRange.start ?? '09:00');
        setSplitEnd(firstRange.end ?? '13:00');
        setSplitStart2(secondRange.start ?? '16:00');
        setSplitEnd2(secondRange.end ?? '20:00');
        setAvailabilityMode(mode);
        setAllDay(isAllDay);

        setSpecialties(normalizeSpecialties((p as any).specialties));
        setAvatar(p.avatarUrl ?? null);

        setPrice(String(p.visitPrice ?? 0));
        setRadius(String(p.radiusKm ?? 30));

        setPricingLabel((p.pricingLabel ?? '').trim());
        // ✅ actualizar snapshots (baseline) SOLO cuando viene del backend
        const bioBase = p.bio ?? '';
        bioSnapRef.current = bioBase;
        headlineSnapRef.current = (p.specialtyHeadline ?? '').trim();
        businessNameSnapRef.current = (p.businessName ?? '').trim();

        const baseRanges =
          Array.isArray(p.availability?.ranges) && p.availability.ranges.length > 0
            ? p.availability.ranges
            : p.availability?.start && p.availability?.end
              ? [{ start: p.availability.start, end: p.availability.end }]
              : [{ start: '09:00', end: '18:00' }];

        const firstBaseRange = baseRanges[0] ?? { start: '09:00', end: '18:00' };
        const secondBaseRange = baseRanges[1] ?? { start: '16:00', end: '20:00' };

        const availBase = {
          days: p.availability?.days ?? [1, 2, 3, 4, 5],
          mode:
            baseRanges.length === 1 &&
            firstBaseRange.start === '00:00' &&
            firstBaseRange.end === '00:00'
              ? 'allday'
              : baseRanges.length > 1
                ? 'split'
                : 'single',
          allDay:
            baseRanges.length === 1 &&
            firstBaseRange.start === '00:00' &&
            firstBaseRange.end === '00:00',
          start: firstBaseRange.start,
          end: firstBaseRange.end,
          splitStart: firstBaseRange.start,
          splitEnd: firstBaseRange.end,
          splitStart2: secondBaseRange.start,
          splitEnd2: secondBaseRange.end,
        };

        availabilitySnapRef.current = JSON.stringify(availBase);

        const priceBase = {
          visitPrice: p.visitPrice ?? 0,
          radiusKm: p.radiusKm ?? 30,
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

      // 2) CERTS (lazy) -> ahora se cargan solo cuando abrís el bloque

      // 3) SUSCRIPCIÓN (background)
      try {
        const sub = await getMySubscription({ force: true });
        setSubscription(sub);
      } catch (e) {
        if (__DEV__) console.log('[Subscription] error al cargar', e);
      }
    },
    [logout],
  );

  const refreshPortfolio = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      const { data } = await api.get('/specialists/me/portfolio', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      setPortfolio(Array.isArray(data?.items) ? data.items : []);
      portfolioLoadedOnceRef.current = true;
    } catch (e) {
      if (__DEV__) console.log('[SpecialistHome] refreshPortfolio error', e);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

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

  const loadActiveOrdersCount = useCallback(async () => {
    if (!token) return;

    try {
      setActiveOrdersLoading(true);

      const { data } = await api.get('/orders/mine', {
        params: { role: 'specialist', status: 'open' },
        headers: { 'Cache-Control': 'no-cache' },
      });

      const orders = Array.isArray(data?.orders) ? data.orders : [];

      const active = orders.filter((o: any) =>
        ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'].includes(String(o?.status ?? '').toUpperCase()),
      );

      setActiveOrdersCount(active.length);
    } catch (e) {
      if (__DEV__) console.log('[SpecialistHome] error cargando órdenes activas', e);
      setActiveOrdersCount(0);
    } finally {
      setActiveOrdersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // ✅ marcamos que ya hicimos el primer load (para que Focus no duplique)
    didInitialLoadRef.current = true;

    loadCategories();
    reloadProfileAndSubscription({ silent: false });
    loadCertsOnce();

    const task = InteractionManager.runAfterInteractions(() => {
      loadReviews();
      loadActiveOrdersCount();
    });

    return () => {
      const maybeCancel = (task as any)?.cancel;
      if (typeof maybeCancel === 'function') maybeCancel();
    };
  }, [
    token,
    loadCategories,
    reloadProfileAndSubscription,
    loadReviews,
    loadCertsOnce,
    loadActiveOrdersCount,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;

      // ✅ si acaba de montar y ya hizo el load inicial, evitamos doble fetch
      if (didInitialLoadRef.current) {
        didInitialLoadRef.current = false;
        return;
      }

      reloadProfileAndSubscription({ silent: true });
      loadCategories();
      loadActiveOrdersCount();
    }, [token, reloadProfileAndSubscription, loadCategories, loadActiveOrdersCount]),
  );

  // ✅ pedir ubicación apenas entra el especialista (una vez por sesión y sin bloquear)
  useEffect(() => {
    if (!token) return;

    const missingCenter = !profile?.centerLat || !profile?.centerLng;
    if (!missingCenter) return;

    const maxAttempts = Platform.OS === 'web' ? 1 : 2;

    if (locationAttemptRef.current >= maxAttempts) return;
    if (locationRequestedRef.current && locationAttemptRef.current >= 1) return;

    locationRequestedRef.current = true;
    locationAttemptRef.current += 1;

    InteractionManager.runAfterInteractions(async () => {
      const ok = await updateLocationFromDevice({ silent: true });

      if (Platform.OS !== 'web' && !ok && locationAttemptRef.current < maxAttempts) {
        locationRetryTimeoutRef.current = setTimeout(() => {
          if (!profile?.centerLat || !profile?.centerLng) {
            updateLocationFromDevice({ silent: true });
            locationAttemptRef.current += 1;
          }
        }, 2500);
      }
    });

    return () => {
      if (locationRetryTimeoutRef.current) {
        clearTimeout(locationRetryTimeoutRef.current);
        locationRetryTimeoutRef.current = null;
      }
    };
  }, [token, profile?.centerLat, profile?.centerLng, updateLocationFromDevice]);

  const avatarSrc = useMemo(() => {
    const u = absoluteUrl(avatar);
    return u ? { uri: u } : require('../assets/avatar-placeholder.png');
  }, [avatar]);

  // ✅ evita recalcular reduce en cada render
  const computedRating = useMemo(() => {
    const avg =
      profile?.ratingAvg != null && !Number.isNaN(profile.ratingAvg)
        ? profile.ratingAvg
        : reviews.length
          ? reviews.reduce((acc, r) => acc + r.score, 0) / reviews.length
          : 0;

    const count = profile?.ratingCount != null ? profile.ratingCount : reviews.length;

    return { avg, count };
  }, [profile?.ratingAvg, profile?.ratingCount, reviews]);

  const statsDone = profile?.stats?.done ?? 0;
  const statsCanceled = profile?.stats?.canceled ?? 0;

  const kycStatus = profile?.kycStatus ?? 'UNVERIFIED';
  const bgStatus = profile?.backgroundCheck?.status ?? null;

  const requiresBackgroundCheck = !!(profile as any)?.requiresBackgroundCheck;
  const serviceModesConfigured = !!(profile as any)?.serviceModesConfigured;
  const backgroundCheckApproved =
    typeof (profile as any)?.backgroundCheckApproved === 'boolean'
      ? !!(profile as any)?.backgroundCheckApproved
      : bgStatus === 'APPROVED';

  const missingSpecialties = specialties.length === 0;
  const missingServiceModes = !serviceModesConfigured;

  const profileIncomplete = !!profile && (missingSpecialties || missingServiceModes);

  const incompleteBannerTitle =
    missingSpecialties && missingServiceModes
      ? 'Completá tu perfil profesional'
      : missingServiceModes
        ? 'Configurá tus modalidades'
        : 'Seleccioná tu rubro';

  const incompleteBannerText =
    missingSpecialties && missingServiceModes
      ? 'Te faltan rubros y modalidades para completar tu perfil y poder recibir trabajos.'
      : missingServiceModes
        ? 'Indicá cómo ofrecés tu servicio: a domicilio, en oficina/local u online.'
        : 'Seleccioná al menos un rubro para completar tu perfil profesional.';

  function handleOpenIncompleteProfile() {
    if (missingServiceModes) {
      setOpenServiceModes(true);
      setOpenRubros(false);
      return;
    }

    if (missingSpecialties) {
      setOpenRubros(true);
      setOpenServiceModes(false);
    }
  }

  // ✅ Suscripción OK: ACTIVE o TRIALING con días > 0
  const subscriptionOk = useMemo(() => {
    if (!subscription) return false;
    return subscription.isTrialActive || subscription.isSubscriptionActive;
  }, [subscription]);

  const specialistOrdersLimitReached = activeOrdersCount >= 3;

  const canToggleAvailability =
    subscriptionOk &&
    serviceModesConfigured &&
    kycStatus === 'VERIFIED' &&
    (!requiresBackgroundCheck || backgroundCheckApproved) &&
    !specialistOrdersLimitReached;

  // 1) "visible" = aparece en búsquedas (SIN horario)
  const visibleEffective = canToggleAvailability && availableNow;

  // 2) "availableNow" = visible + dentro del horario (CON horario)
  const scheduleOk = isWithinAvailability(
    availabilityMode === 'allday'
      ? {
          days,
          ranges: [{ start: '00:00', end: '00:00' }],
        }
      : availabilityMode === 'split'
        ? {
            days,
            ranges: [
              { start: splitStart, end: splitEnd },
              { start: splitStart2, end: splitEnd2 },
            ],
          }
        : {
            days,
            ranges: [{ start, end }],
          },
  );

  const availableNowEffective = visibleEffective && scheduleOk;

  // permisos para cámara / galería
  async function requestCamera() {
    if (Platform.OS === 'web') return true;

    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== 'granted') {
      Alert.alert('Permisos', 'Necesitamos permiso de cámara para sacar tu foto.');
      return false;
    }
    return true;
  }
  async function requestMedia() {
    if (Platform.OS === 'web') return true;

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
      setSavingKey('avatar', true);
      const manipulated =
        Platform.OS === 'web'
          ? { uri: localUri }
          : await ImageManipulator.manipulateAsync(localUri, [{ resize: { width: 1200 } }], {
              compress: 0.9,
              format: ImageManipulator.SaveFormat.JPEG,
            });

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
      setSavingKey('avatar', false);
    }
  }

  async function handleAddPortfolioImage() {
    try {
      if (portfolio.length >= 8) {
        Alert.alert('Límite alcanzado', 'Podés subir hasta 8 imágenes de trabajos realizados.');
        return;
      }

      const granted = await requestMedia();
      if (!granted) return;

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false, // ✅ desactivamos editor nativo confuso
      });

      if (res.canceled || !res.assets?.[0]?.uri) return;

      // ✅ mostramos preview propio antes de subir
      setPortfolioLocalUri(res.assets[0].uri);
      setPortfolioUploadPreviewOpen(true);
    } catch (e) {
      if (__DEV__) console.log('[handleAddPortfolioImage] picker error', e);
      Alert.alert('Ups', 'No se pudo seleccionar la imagen.');
    }
  }

  async function confirmPortfolioImageUpload() {
    if (!portfolioLocalUri) return;

    try {
      if (portfolio.length >= 8) {
        Alert.alert('Límite alcanzado', 'Podés subir hasta 8 imágenes de trabajos realizados.');
        return;
      }

      setSavingKey('portfolio', true);

      const manipulated =
        Platform.OS === 'web'
          ? { uri: portfolioLocalUri }
          : await ImageManipulator.manipulateAsync(
              portfolioLocalUri,
              [{ resize: { width: 1600 } }],
              { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
            );

      const form = new FormData();
      form.append('file', {
        uri: manipulated.uri,
        name: 'portfolio.jpg',
        type: 'image/jpeg',
      } as any);

      const uploadRes = await api.post('/specialists/portfolio/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const relativeUrl: string | undefined = uploadRes?.data?.url;
      if (!relativeUrl) throw new Error('upload_failed');

      await api.post('/specialists/me/portfolio', {
        imageUrl: relativeUrl,
        caption: null,
      });

      await refreshPortfolio();

      setPortfolioUploadPreviewOpen(false);
      setPortfolioLocalUri(null);

      Alert.alert('Listo', 'Imagen agregada a tus trabajos realizados.');
    } catch (e: any) {
      const msg =
        e?.response?.data?.error === 'portfolio_limit_reached'
          ? 'Ya alcanzaste el máximo de 8 imágenes.'
          : e?.response?.data?.error === 'low_quality'
            ? 'La imagen es muy chica. Probá con otra más nítida.'
            : 'No se pudo subir la imagen.';

      Alert.alert('Ups', msg);
    } finally {
      setSavingKey('portfolio', false);
    }
  }

  async function handleDeletePortfolioImage(itemId: string) {
    try {
      setSavingKey('portfolio', true);

      await api.delete(`/specialists/me/portfolio/${itemId}`);
      await refreshPortfolio();

      Alert.alert('Listo', 'La imagen fue eliminada.');
    } catch (e) {
      if (__DEV__) console.log('[handleDeletePortfolioImage] error', e);
      Alert.alert('Ups', 'No se pudo eliminar la imagen.');
    } finally {
      setSavingKey('portfolio', false);
    }
  }

  async function saveHeadline() {
    try {
      setSavingKey('headline', true);

      const value = headline.trim();
      // backend: max 60
      const safe = value.length ? value.slice(0, 60) : null;

      await api.patch('/specialists/me', { specialtyHeadline: safe });

      setProfile((prev) => (prev ? { ...prev, specialtyHeadline: safe } : prev));
      headlineSnapRef.current = safe ?? '';

      Alert.alert('Listo', 'Especificación actualizada.');
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la especificación.');
    } finally {
      setSavingKey('headline', false);
    }
  }

  async function saveBusinessName() {
    try {
      setSavingKey('businessName', true);
      const value = businessName.trim();
      const safe = value.length ? value.slice(0, 60) : null; // mismo límite que headline

      await api.patch('/specialists/me', { businessName: safe });

      setProfile((prev) => (prev ? { ...prev, businessName: safe } : prev));
      businessNameSnapRef.current = safe ?? '';
      setBusinessName((safe ?? '').trim());

      Alert.alert('Listo', 'Nombre de negocio actualizado.');
    } catch {
      Alert.alert('Ups', 'No se pudo guardar el nombre de negocio.');
    } finally {
      setSavingKey('businessName', false);
    }
  }

  // saves
  async function saveBio() {
    try {
      setSavingKey('bio', true);
      await api.patch('/specialists/me', { bio });
      setProfile((prev) => (prev ? { ...prev, bio } : prev));
      Alert.alert('Listo', 'Biografía actualizada.');
      bioSnapRef.current = bio;
    } catch {
      Alert.alert('Ups', 'No se pudo guardar.');
    } finally {
      setSavingKey('bio', false);
    }
  }

  async function toggleAvailable(v: boolean) {
    // 1) Suscripción
    if (!subscriptionOk) {
      Alert.alert(
        'Suscripción requerida',
        'Para activarte y aparecer en búsquedas necesitás tener una suscripción activa o una prueba gratuita vigente.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ver suscripción', onPress: () => (navigation as any).navigate('Subscription') },
        ],
      );
      return;
    }

    // 2) Modalidades obligatorias
    if (!serviceModesConfigured) {
      Alert.alert(
        'Configurá tus modalidades',
        'Primero tenés que indicar cómo ofrecés tu servicio: a domicilio, en local/oficina u online.',
      );
      return;
    }

    // 3) KYC
    if (kycStatus !== 'VERIFIED') {
      Alert.alert(
        'Verificación requerida',
        'Para activar tu disponibilidad necesitás tener la verificación de identidad aprobada.',
      );
      return;
    }

    // 4) Antecedentes solo si corresponden por modalidad
    if (requiresBackgroundCheck && !backgroundCheckApproved) {
      Alert.alert(
        'Antecedentes requeridos',
        'Para esta modalidad necesitás tener el certificado de buena conducta aprobado.',
      );
      return;
    }

    try {
      setAvailableNow(v);
      await api.patch('/specialists/me', {
        available: v,
        availableNow: v,
      });

      await reloadProfileAndSubscription({ silent: true });
    } catch (e: any) {
      const err = e?.response?.data?.error;

      if (e?.response?.status === 403 && err === 'background_check_required') {
        Alert.alert(
          'Antecedentes requeridos',
          'Para esta modalidad necesitás tener el certificado de buena conducta aprobado.',
        );
        setAvailableNow(false);
        return;
      }

      if (e?.response?.status === 403 && err === 'kyc_required') {
        Alert.alert(
          'Verificación requerida',
          'Para activar tu disponibilidad necesitás tener la verificación de identidad aprobada.',
        );
        setAvailableNow(false);
        return;
      }

      if (e?.response?.status === 403 && err === 'subscription_required') {
        Alert.alert(
          'Suscripción requerida',
          'Necesitás una suscripción activa o una prueba gratuita vigente para activar tu disponibilidad.',
        );
        setAvailableNow(false);
        return;
      }

      if (e?.response?.status === 403 && err === 'user_blocked') {
        Alert.alert('Cuenta bloqueada', 'Tu cuenta está bloqueada. Contactá soporte.');
        setAvailableNow(false);
        return;
      }

      setAvailableNow(false);
      Alert.alert('Ups', 'No se pudo actualizar el estado.');
    }
  }

  async function saveAvailability() {
    try {
      setSavingKey('availability', true);

      let availabilityPayload:
        | {
            days: number[];
            start: string;
            end: string;
            mode: 'single' | 'allday';
          }
        | {
            days: number[];
            ranges: { start: string; end: string }[];
            mode: 'split';
          };

      if (availabilityMode === 'allday') {
        availabilityPayload = {
          days,
          start: '00:00',
          end: '00:00',
          mode: 'allday',
        };
      } else if (availabilityMode === 'split') {
        availabilityPayload = {
          days,
          ranges: [
            { start: splitStart, end: splitEnd },
            { start: splitStart2, end: splitEnd2 },
          ],
          mode: 'split',
        };
      } else {
        availabilityPayload = {
          days,
          start,
          end,
          mode: 'single',
        };
      }

      await api.patch('/specialists/me', {
        availability: availabilityPayload,
      });

      availabilitySnapRef.current = JSON.stringify({
        days,
        mode: availabilityMode,
        allDay,
        start,
        end,
        splitStart,
        splitEnd,
        splitStart2,
        splitEnd2,
      });

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              availability: availabilityPayload,
            }
          : prev,
      );

      Alert.alert('Listo', 'Disponibilidad actualizada.');
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la disponibilidad.');
    } finally {
      setSavingKey('availability', false);
    }
  }

  async function saveSpecialties() {
    try {
      setSavingKey('specialties', true);
      const cleaned = Array.from(new Set(specialties.filter((s) => !HIDDEN_SPECIALTIES.has(s))));

      await api.patch('/specialists/specialties', { specialties: cleaned });

      // ✅ refrescamos porque el backend puede haber ajustado radiusKm
      await reloadProfileAndSubscription({ silent: true });

      specialtiesSnapRef.current = JSON.stringify(Array.from(new Set(cleaned)).sort());

      Alert.alert('Listo', 'Rubros actualizados.');
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'No se pudieron actualizar los rubros.';
      Alert.alert('Ups', String(msg));
    } finally {
      setSavingKey('specialties', false);
    }
  }

  async function savePriceAndRadius() {
    try {
      setSavingKey('priceRadius', true);

      const visitPrice = Math.max(0, Math.floor(Number(price) || 0));

      // ⛔ clamp radio: 0 → 30 km
      const radiusNum = Math.max(0, Number(radius) || 0);
      const radiusKm = Math.min(maxAllowedRadiusKm, radiusNum);

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

      setRadius(String(radiusKm));

      priceRadiusSnapRef.current = JSON.stringify({
        visitPrice,
        radiusKm,
        pricingLabel: (pricingLabelSafe ?? '').trim(),
      });

      Alert.alert('Listo', 'Tarifa, etiqueta y radio actualizados.');
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la tarifa/radio.');
    } finally {
      setSavingKey('priceRadius', false);
    }
  }

  async function saveServiceModes() {
    try {
      setSavingKey('serviceModes', true);

      const normalizedModes = normalizeModes(serviceModes);

      if (normalizedModes.length === 0) {
        Alert.alert(
          'Falta un paso',
          'Seleccioná al menos una modalidad de servicio para continuar.',
        );
        return;
      }

      const payload: {
        serviceModes: ('HOME' | 'OFFICE' | 'ONLINE')[];
        officeAddress?: {
          formatted: string;
          locality: string;
        } | null;
      } = {
        serviceModes: normalizedModes,
      };

      if (normalizedModes.includes('OFFICE')) {
        if (!officeAddress.trim()) {
          Alert.alert('Debés cargar la dirección de tu oficina.');
          return;
        }

        const street = streetOnly(officeAddress);
        if (!street) {
          Alert.alert('Debés cargar la dirección de tu oficina.');
          return;
        }

        const loc = String(officeLocality ?? '').trim() || 'Río Cuarto';

        let formatted = street;

        if (!normalizeText(formatted).includes(normalizeText(loc))) {
          formatted = `${formatted}, ${loc}`;
        }

        if (!normalizeText(formatted).includes('cordoba')) {
          formatted = `${formatted}, Córdoba`;
        }

        if (!normalizeText(formatted).includes('argentina')) {
          formatted = `${formatted}, Argentina`;
        }

        formatted = formatted.replace(/\s*,\s*/g, ', ').trim();

        payload.officeAddress = {
          formatted,
          locality: loc,
        };
      } else {
        payload.officeAddress = null;
      }

      if (__DEV__) {
        console.log('[saveServiceModes] payload', JSON.stringify(payload, null, 2));
      }

      await api.patch('/specialists/me', payload);

      // ✅ refrescamos desde backend y dejamos que esa sea la única fuente de verdad
      await reloadProfileAndSubscription({ silent: true });

      Alert.alert('Listo', 'Modalidades guardadas correctamente.');
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      console.error('[saveServiceModes] error', status, data ?? e);

      Alert.alert(
        'Error',
        data?.message
          ? String(data.message)
          : data?.error === 'office_geocode_failed'
            ? 'No pudimos ubicar esa dirección. Revisá la calle, la altura y la localidad.'
            : data?.error === 'office_address_required'
              ? 'Debés completar la dirección de tu oficina/local.'
              : data?.error === 'office_coords_outside_cordoba'
                ? 'La dirección quedó fuera de Córdoba. Revisá la localidad ingresada.'
                : 'No se pudieron guardar las modalidades.',
      );
    } finally {
      setSavingKey('serviceModes', false);
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

  function toggleServiceMode(mode: 'HOME' | 'OFFICE' | 'ONLINE') {
    setServiceModes((prev) => {
      const alreadySelected = prev.includes(mode);
      const next = alreadySelected ? prev.filter((m) => m !== mode) : [...prev, mode];

      const isAddingHome = mode === 'HOME' && !alreadySelected;

      if (isAddingHome && !backgroundCheckApproved) {
        setHomeBgRequiredModalOpen(true);
      }

      return next;
    });
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
    if (sub.isTrialActive) {
      if (sub.trialDaysRemaining <= 0) return 'Tu prueba gratuita termina hoy.';
      return 'Tenés una prueba gratuita activa como especialista.';
    }

    if (sub.isSubscriptionActive) {
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
        .map((c) => ({
          slug: c.slug,
          name: getCategoryDisplayName(c.slug, c.name),
        }));
    }

    return (SPECIALTY_OPTIONS as readonly string[])
      .filter((s) => !HIDDEN_SPECIALTIES.has(s))
      .map((s) => ({
        slug: s,
        name: getCategoryDisplayName(s, s),
      }));
  }, [categoryOptions]);

  const normalizedSpecialtyQuery = useMemo(() => normalizeText(specialtyQuery), [specialtyQuery]);

  const selectedChipSource = useMemo(() => {
    return chipSource
      .filter((opt) => specialties.includes(opt.slug))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [chipSource, specialties]);

  const filteredChipSource = useMemo(() => {
    const withMeta = chipSource.map((opt) => {
      const meta = categoryOptions.find((c) => c.slug === opt.slug);
      return {
        ...opt,
        groupName: meta?.groupName ?? '',
        groupSlug: meta?.groupSlug ?? '',
      };
    });

    const filtered = !normalizedSpecialtyQuery
      ? withMeta
      : withMeta.filter((opt) => {
          const name = normalizeText(opt.name);
          const slug = normalizeText(opt.slug);
          const groupName = normalizeText(opt.groupName);
          const groupSlug = normalizeText(opt.groupSlug);

          return (
            name.includes(normalizedSpecialtyQuery) ||
            slug.includes(normalizedSpecialtyQuery) ||
            groupName.includes(normalizedSpecialtyQuery) ||
            groupSlug.includes(normalizedSpecialtyQuery)
          );
        });

    return filtered.sort((a, b) => {
      const aSelected = specialties.includes(a.slug) ? 1 : 0;
      const bSelected = specialties.includes(b.slug) ? 1 : 0;

      if (aSelected !== bSelected) return bSelected - aSelected;

      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }, [chipSource, categoryOptions, normalizedSpecialtyQuery, specialties]);

  const specialtiesRequiringCert = useMemo(
    () => specialties.filter((s) => requiresCert(s)),
    [specialties, requiresCert],
  );

  const enabledByCerts = useMemo(() => {
    if (specialtiesRequiringCert.length === 0) return true;

    return specialtiesRequiringCert.every((slug) => {
      const cert = certs.find((c) => c.category.slug === slug);
      return cert?.status === 'APPROVED';
    });
  }, [specialtiesRequiringCert, certs]);

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

  const headlineDirty = useMemo(() => {
    return headline.trim() !== headlineSnapRef.current;
  }, [headline]);

  const businessNameDirty = useMemo(() => {
    return businessName.trim() !== businessNameSnapRef.current;
  }, [businessName]);

  const availabilityDirty = useMemo(() => {
    const current = JSON.stringify({
      days,
      mode: availabilityMode,
      allDay,
      start,
      end,
      splitStart,
      splitEnd,
      splitStart2,
      splitEnd2,
    });

    return current !== availabilitySnapRef.current;
  }, [days, availabilityMode, allDay, start, end, splitStart, splitEnd, splitStart2, splitEnd2]);

  const priceRadiusDirty = useMemo(() => {
    const visitPrice = Math.max(0, Math.floor(Number(price) || 0));

    const radiusNum = Math.max(0, Number(radius) || 0);
    const radiusKm = Math.min(maxAllowedRadiusKm, radiusNum);

    const current = JSON.stringify({
      visitPrice,
      radiusKm,
      pricingLabel: pricingLabel.trim(),
    });

    return current !== priceRadiusSnapRef.current;
  }, [price, radius, pricingLabel, maxAllowedRadiusKm]);

  const specialtiesDirty = useMemo(() => {
    const cleaned = Array.from(new Set(specialties.filter((s) => !HIDDEN_SPECIALTIES.has(s))));
    const base = JSON.parse(specialtiesSnapRef.current || '[]') as string[];
    return !sameStringSet(cleaned, base);
  }, [specialties]);

  const serviceModesDirty = useMemo(() => {
    const current = serviceModesSnapshot(serviceModes, officeAddress, officeLocality);
    return current !== serviceModesSnapRef.current;
  }, [serviceModes, officeAddress, officeLocality]);

  useEffect(() => {
    if (loading) return;
    if (!profile) return;

    setMissingModesModalOpen(false);
  }, [loading, profile]);

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
            <AppLogo style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandText}>Solucity</Text>
          </View>
          <Pressable
            style={styles.bellBtn}
            onPress={handleOpenNotifications}
            hitSlop={12}
            pressRetentionOffset={12}
          >
            <View style={styles.bellHitArea}>
              <Ionicons name="notifications-outline" size={26} color="#E9FEFF" />
              {unread > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
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

        {currentMode === 'specialist' && (
          <View style={styles.modeSwitchWrap}>
            <Pressable style={styles.modeSwitchCard} onPress={handleSwitchToClientMode}>
              <View style={styles.modeSwitchIconWrap}>
                <Ionicons name="swap-horizontal" size={22} color="#0A5B63" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.modeSwitchEyebrow}>Modo actual: Especialista</Text>
                <Text style={styles.modeSwitchTitle}>Cambiar a modo cliente</Text>
                <Text style={styles.modeSwitchText}>
                  Buscá especialistas y creá órdenes sin salir de tu cuenta.
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={22} color="#0A5B63" />
            </Pressable>
          </View>
        )}

        {profileIncomplete && (
          <View style={styles.incompleteBannerWrap}>
            <View style={styles.incompleteBanner}>
              <View style={styles.incompleteBannerIconWrap}>
                <Ionicons name="alert-circle-outline" size={20} color="#5A3E00" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.incompleteBannerTitle}>{incompleteBannerTitle}</Text>
                <Text style={styles.incompleteBannerText}>{incompleteBannerText}</Text>
              </View>

              <Pressable onPress={handleOpenIncompleteProfile} style={styles.incompleteBannerBtn}>
                <Text style={styles.incompleteBannerBtnText}>Completar</Text>
              </Pressable>
            </View>
          </View>
        )}
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          enableOnAndroid={Platform.OS === 'android'}
          extraScrollHeight={Platform.OS === 'web' ? 0 : 90}
          extraHeight={Platform.OS === 'web' ? 0 : 140}
          enableResetScrollToCoords={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableAutomaticScroll={Platform.OS !== 'web'}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {/* Vista previa (como te ve el cliente en la lista) */}
          <View style={styles.card}>
            <Text style={[styles.muted, { marginBottom: 10, fontWeight: '800' }]}>
              Vista previa — así te ven los clientes
            </Text>

            <View style={{ flexDirection: 'row', gap: 14 }}>
              {/* Avatar */}
              <View style={styles.avatarBox}>
                <View style={styles.avatarWrap}>
                  <Image source={avatarSrc} style={styles.avatar} />
                  <Pressable style={styles.camFab} onPress={() => setPickerOpen(true)}>
                    <Ionicons name="camera" size={18} color="#0A5B63" />
                  </Pressable>
                </View>
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                {/* Nombre + dot disponibilidad */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {profile?.businessName?.trim() ||
                      businessName.trim() ||
                      profile?.name ||
                      'Especialista'}
                  </Text>

                  <View
                    style={[
                      styles.statusDotInline,
                      { backgroundColor: availableNowEffective ? '#22c55e' : '#ef4444' },
                    ]}
                  />
                </View>

                {/* Headline (lo que ve el cliente abajo del nombre) */}
                {profile?.specialtyHeadline || headline.trim() ? (
                  <Text style={styles.previewHeadline} numberOfLines={2}>
                    {(profile?.specialtyHeadline ?? headline).trim()}
                  </Text>
                ) : null}

                {/* Rating */}
                <View style={styles.starsRow}>
                  {(() => {
                    const avg = computedRating.avg;
                    const count = computedRating.count;

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
                        <Text style={styles.muted}>
                          {' '}
                          — {avg ? avg.toFixed(1) : '0.0'} ({count || 0})
                        </Text>
                      </>
                    );
                  })()}
                </View>

                {/* Pills (similares a la lista del cliente) */}
                <View style={styles.previewPillsRow}>
                  <View
                    style={[
                      styles.previewPillSolid,
                      visibleEffective ? styles.previewPillGood : styles.previewPillBad,
                    ]}
                  >
                    <Ionicons name="time-outline" size={14} color="#E9FEFF" />
                    <Text style={styles.previewPillSolidText}>
                      {availableNowEffective ? 'Disponible' : 'No disponible'}
                    </Text>
                  </View>

                  {Number(price) > 0 ? (
                    <View style={styles.previewPillSoft}>
                      <Ionicons name="cash-outline" size={14} color="#E9FEFF" />
                      <Text style={styles.previewPillSoftText}>
                        {pricingLabel?.trim() || 'Tarifa'}: ${Number(price).toLocaleString('es-AR')}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.previewPillSoft}>
                    <Ionicons name="ribbon-outline" size={14} color="#E9FEFF" />
                    <Text style={styles.previewPillSoftText}>
                      {enabledByCerts ? 'Habilitado' : 'No habilitado'}
                    </Text>
                  </View>
                </View>
              </View>
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
                    {subscription.isTrialActive
                      ? 'Período de prueba'
                      : subscription.isSubscriptionActive
                        ? 'Suscripción activa'
                        : subscription.status === 'PAST_DUE'
                          ? 'Pago pendiente'
                          : 'Suscripción inactiva'}
                  </Text>
                </View>

                <Ionicons
                  name={subscription.isSubscriptionActive ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color="#E9FEFF"
                />
              </View>

              <Text style={styles.subMainText}>{renderSubscriptionMainText(subscription)}</Text>

              {subscription.isTrialActive ? (
                <Text style={styles.subSecondaryText}>
                  Te quedan{' '}
                  <Text style={styles.subDaysHighlight}>
                    {subscription.trialDaysRemaining <= 0
                      ? 'menos de 1 día'
                      : `${subscription.trialDaysRemaining} día${subscription.trialDaysRemaining === 1 ? '' : 's'}`}
                  </Text>{' '}
                  de prueba gratuita.
                </Text>
              ) : null}

              {subscription.isSubscriptionActive && subscription.currentPeriodEnd ? (
                <Text style={styles.subSecondaryText}>
                  Activa hasta: {formatDate(subscription.currentPeriodEnd)} ·{' '}
                  <Text style={styles.subDaysHighlight}>
                    {subscription.subscriptionDaysRemaining} día
                    {subscription.subscriptionDaysRemaining === 1 ? '' : 's'}
                  </Text>{' '}
                  restantes
                </Text>
              ) : null}

              {/* ✅ CTA cuando hace falta pagar / activar */}
              {!subscription.isTrialActive && !subscription.isSubscriptionActive ? (
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
                      {subscription.status === 'PAST_DUE'
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
                  {visibleEffective ? 'Visible' : 'No visible'}
                </Text>
              </View>
            </View>
            {specialistOrdersLimitReached ? (
              <View
                style={{
                  marginTop: 10,
                  marginBottom: 10,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255, 226, 155, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 226, 155, 0.25)',
                }}
              >
                <Text style={{ color: '#FFE29B', fontWeight: '800' }}>
                  Ya tenés 3 órdenes en proceso. Debés finalizar o cancelar al menos 1 para volver a
                  tener visibilidad.
                </Text>

                <Pressable
                  onPress={() =>
                    (navigation as any).navigate('Agenda', {
                      screen: 'AgendaMain',
                      params: {
                        initialSection: 'ASSIGNED',
                        refresh: true,
                      },
                    })
                  }
                  style={[
                    styles.btn,
                    {
                      marginTop: 10,
                      backgroundColor: 'transparent',
                      borderWidth: 1,
                      borderColor: '#FFE29B',
                    },
                  ]}
                >
                  <Text style={[styles.btnT, { color: '#FFE29B' }]}>Ir a Agenda</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.stateRow}>
              <Text style={styles.label}>Habilitar disponibilidad</Text>
              <Switch
                value={availableNow}
                onValueChange={toggleAvailable}
                disabled={!canToggleAvailability || activeOrdersLoading}
              />
            </View>
            {!canToggleAvailability ? (
              <Text style={[styles.muted, { marginTop: 6 }]}>
                {specialistOrdersLimitReached
                  ? 'Tu visibilidad está pausada porque ya alcanzaste el límite de 3 órdenes activas.'
                  : !subscriptionOk
                    ? 'Tu disponibilidad requiere una suscripción activa o una prueba gratuita vigente. Tocá la tarjeta de Suscripción para revisarla.'
                    : !serviceModesConfigured
                      ? 'Primero tenés que configurar cómo ofrecés tu servicio: a domicilio, local/oficina u online.'
                      : kycStatus !== 'VERIFIED'
                        ? 'Tu disponibilidad se habilita cuando validemos tu identidad.'
                        : requiresBackgroundCheck && !backgroundCheckApproved
                          ? 'Para esta modalidad necesitás tener el certificado de buena conducta aprobado.'
                          : 'Completá los requisitos pendientes para habilitar tu disponibilidad.'}
              </Text>
            ) : null}

            {!serviceModesConfigured ? (
              <Pressable
                onPress={() => {
                  setOpenServiceModes(true);
                  setMissingModesModalOpen(false);
                }}
                style={[
                  styles.btn,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: '#E9FEFF',
                    marginTop: 10,
                  },
                ]}
              >
                <Text style={[styles.btnT, { color: '#E9FEFF' }]}>Configurar modalidades</Text>
              </Pressable>
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
                <Text style={[styles.btnT, { color: '#FFE29B' }]}>
                  {subscription?.status === 'PAST_DUE'
                    ? 'Regularizar suscripción'
                    : 'Activar suscripción'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => (navigation as any).navigate('KycStatus')}
              style={{
                marginTop: 10,
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
                <Ionicons name="shield-checkmark-outline" size={18} color="#E9FEFF" />
                <Text style={{ color: '#E9FEFF', fontWeight: '800', flex: 1 }}>
                  Verificación de identidad:{' '}
                  {profile?.kycStatus === 'VERIFIED'
                    ? 'Aprobada ✅'
                    : profile?.kycStatus === 'PENDING'
                      ? 'En revisión'
                      : profile?.kycStatus === 'REJECTED'
                        ? 'Rechazada — reenviar'
                        : 'Pendiente — completar'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#E9FEFF" />
            </Pressable>

            {serviceModes.includes('HOME') ? (
              <View style={{ marginTop: 10 }}>
                <Pressable
                  onPress={() => {
                    (navigation as any).navigate('Perfil', { screen: 'ProfileMain' });

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

                <Text style={[styles.muted, { marginTop: 8 }]}>
                  Este requisito es obligatorio si ofrecés servicio a domicilio.
                </Text>

                {bgStatus === 'REJECTED' && profile?.backgroundCheck?.rejectionReason ? (
                  <Text style={[styles.muted, { marginTop: 8 }]}>
                    Motivo: {profile.backgroundCheck.rejectionReason}
                  </Text>
                ) : null}
              </View>
            ) : null}
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

          {/* Tu perfil (desplegable) */}
          <Section title="Tu perfil" open={openPerfil} onToggle={() => setOpenPerfil((v) => !v)}>
            <Text style={styles.subTitle}>Nombre de tu negocio (opcional)</Text>

            <TextInput
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Ej: Plomería González / Estudio Contable Ríos"
              placeholderTextColor="#9ec9cd"
              style={styles.input}
              maxLength={60}
            />

            <Text style={styles.muted}>
              Si lo completás, los clientes te verán con este nombre en lugar de tu nombre personal
              (máx. 60 caracteres).
            </Text>

            <Pressable
              onPress={saveBusinessName}
              disabled={!businessNameDirty || savingBy.businessName}
              style={[
                styles.btn,
                (!businessNameDirty || savingBy.businessName) && styles.btnDisabled,
              ]}
            >
              {savingBy.businessName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>Guardar nombre de negocio</Text>
              )}
            </Pressable>

            <Text style={styles.subTitle}>¿En qué te especializás?</Text>

            <TextInput
              value={headline}
              onChangeText={setHeadline}
              placeholder="Ej: Ingeniero civil · Cálculo estructural"
              placeholderTextColor="#9ec9cd"
              style={styles.input}
              maxLength={60}
            />

            <Text style={styles.muted}>
              Esto aparece debajo de tu nombre en el listado. Usalo para aclarar tu enfoque o
              subespecialidad dentro del rubro (máx. 60 caracteres).
            </Text>

            <Pressable
              onPress={saveHeadline}
              disabled={!headlineDirty || savingBy.headline}
              style={[styles.btn, (!headlineDirty || savingBy.headline) && styles.btnDisabled]}
            >
              {savingBy.headline ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>Guardar especificación</Text>
              )}
            </Pressable>

            <Text style={styles.subTitle}>Biografía</Text>

            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Contanos sobre tu experiencia…"
              placeholderTextColor="#9ec9cd"
              multiline
              style={[styles.input, { minHeight: 110 }]}
              maxLength={300}
            />

            <Text style={styles.muted}>
              Contá tu experiencia, zona y tipo de trabajos que realizás. Máx. 300 caracteres (
              {bio.length}/300).
            </Text>

            <Pressable
              onPress={saveBio}
              disabled={!bioDirty || savingBy.bio}
              style={[styles.btn, (!bioDirty || savingBy.bio) && styles.btnDisabled]}
            >
              {savingBy.bio ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>Guardar biografía</Text>
              )}
            </Pressable>
          </Section>

          {/* Disponibilidad (desplegable) */}
          <Section
            title="Disponibilidad"
            open={openAvailability}
            onToggle={() => setOpenAvailability((v) => !v)}
          >
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

            <View style={styles.chipsWrap}>
              <Pressable
                onPress={() => {
                  setAvailabilityMode('single');
                  setAllDay(false);
                }}
                style={[
                  styles.chip,
                  availabilityMode === 'single' ? styles.chipOn : styles.chipOff,
                ]}
              >
                <Text
                  style={[
                    styles.chipT,
                    { color: availabilityMode === 'single' ? '#063A40' : '#9ec9cd' },
                  ]}
                >
                  Corrido
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setAvailabilityMode('split');
                  setAllDay(false);
                }}
                style={[styles.chip, availabilityMode === 'split' ? styles.chipOn : styles.chipOff]}
              >
                <Text
                  style={[
                    styles.chipT,
                    { color: availabilityMode === 'split' ? '#063A40' : '#9ec9cd' },
                  ]}
                >
                  Cortado
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setAvailabilityMode('allday');
                  setAllDay(true);
                }}
                style={[
                  styles.chip,
                  availabilityMode === 'allday' ? styles.chipOn : styles.chipOff,
                ]}
              >
                <Text
                  style={[
                    styles.chipT,
                    { color: availabilityMode === 'allday' ? '#063A40' : '#9ec9cd' },
                  ]}
                >
                  24 horas
                </Text>
              </Pressable>
            </View>

            {availabilityMode === 'single' ? (
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
            ) : availabilityMode === 'split' ? (
              <View style={{ marginTop: 6, gap: 10 }}>
                <View>
                  <Text style={[styles.muted, { marginBottom: 6 }]}>Primer turno</Text>
                  <View style={styles.timeRow}>
                    <Pressable
                      style={[styles.input, styles.timeInput]}
                      onPress={() => setShowSplitStartPicker(true)}
                    >
                      <Text style={{ color: '#E9FEFF', textAlign: 'center', fontWeight: '800' }}>
                        {splitStart || '09:00'}
                      </Text>
                    </Pressable>

                    <Text style={[styles.muted, { marginHorizontal: 6 }]}>a</Text>

                    <Pressable
                      style={[styles.input, styles.timeInput]}
                      onPress={() => setShowSplitEndPicker(true)}
                    >
                      <Text style={{ color: '#E9FEFF', textAlign: 'center', fontWeight: '800' }}>
                        {splitEnd || '13:00'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View>
                  <Text style={[styles.muted, { marginBottom: 6 }]}>Segundo turno</Text>
                  <View style={styles.timeRow}>
                    <Pressable
                      style={[styles.input, styles.timeInput]}
                      onPress={() => setShowSplitStart2Picker(true)}
                    >
                      <Text style={{ color: '#E9FEFF', textAlign: 'center', fontWeight: '800' }}>
                        {splitStart2 || '16:00'}
                      </Text>
                    </Pressable>

                    <Text style={[styles.muted, { marginHorizontal: 6 }]}>a</Text>

                    <Pressable
                      style={[styles.input, styles.timeInput]}
                      onPress={() => setShowSplitEnd2Picker(true)}
                    >
                      <Text style={{ color: '#E9FEFF', textAlign: 'center', fontWeight: '800' }}>
                        {splitEnd2 || '20:00'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View
                style={{
                  marginTop: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{ color: '#E9FEFF', fontWeight: '800', textAlign: 'center' }}>
                  Disponible todo el día
                </Text>
              </View>
            )}

            <Pressable
              onPress={saveAvailability}
              disabled={!availabilityDirty || savingBy.availability}
              style={[
                styles.btn,
                (!availabilityDirty || savingBy.availability) && styles.btnDisabled,
              ]}
            >
              {savingBy.availability ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>Guardar disponibilidad</Text>
              )}
            </Pressable>
          </Section>

          {/* Cobertura y tarifa (desplegable) */}
          <Section
            title="Cobertura y tarifa"
            open={openPricing}
            onToggle={() => setOpenPricing((v) => !v)}
          >
            <Text style={styles.subTitle}>Precio base</Text>
            <Text style={styles.muted}>
              Es el valor que verán los clientes como referencia para tu servicio.
            </Text>

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
              Escribí a qué corresponde el precio. Ejemplos: “Por visita”, “Por hora”, “Desde”.
            </Text>

            <View
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>
                Vista previa: {pricingLabel.trim() || 'Etiqueta'} · ${price || '0'}
              </Text>
            </View>

            <Text style={[styles.subTitle, { marginTop: 10 }]}>Radio de trabajo (km)</Text>
            <TextInput
              value={radius}
              onChangeText={setRadius}
              keyboardType="numeric"
              placeholder={String(maxAllowedRadiusKm)}
              placeholderTextColor="#9ec9cd"
              style={styles.input}
            />
            <Text style={styles.muted}>
              Distancia máxima desde tu ubicación actual. El radio máximo permitido es de{' '}
              {maxAllowedRadiusKm} km.
            </Text>
            <Pressable
              onPress={savePriceAndRadius}
              disabled={!priceRadiusDirty || savingBy.priceRadius}
              style={[
                styles.btn,
                (!priceRadiusDirty || savingBy.priceRadius) && styles.btnDisabled,
              ]}
            >
              {savingBy.priceRadius ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>Guardar tarifa y radio</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => updateLocationFromDevice({ silent: false })}
              disabled={savingBy.location}
              style={[
                styles.btn,
                {
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: '#E9FEFF',
                  marginTop: 8,
                },
                savingBy.location && styles.btnDisabled,
              ]}
            >
              {savingBy.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={[styles.btnT, { color: '#E9FEFF' }]}>Actualizando…</Text>
                </View>
              ) : (
                <Text style={[styles.btnT, { color: '#E9FEFF' }]}>Usar mi ubicación actual</Text>
              )}
            </Pressable>
            {(!profile?.centerLat || !profile?.centerLng) && (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Necesitamos tu ubicación para mostrarte correctamente en búsquedas cercanas y
                calcular distancia con los clientes.
              </Text>
            )}
          </Section>

          {/* Modalidad de servicio (desplegable) */}
          <Section
            title="Modalidad de servicio"
            open={openServiceModes}
            onToggle={() => setOpenServiceModes((v) => !v)}
          >
            <View style={{ marginTop: 12, gap: 10 }}>
              <Text style={styles.muted}>
                Elegí cómo ofrecés tu servicio. Si activás “A domicilio”, vas a necesitar tener
                aprobado el certificado de buena conducta para poder estar visible.
              </Text>
              <Pressable
                onPress={() => toggleServiceMode('HOME')}
                style={[
                  styles.chip,
                  serviceModes.includes('HOME') ? styles.chipOn : styles.chipOff,
                ]}
                disabled={savingBy.serviceModes}
              >
                <Text
                  style={[
                    styles.chipT,
                    { color: serviceModes.includes('HOME') ? '#063A40' : '#9ec9cd' },
                  ]}
                >
                  A domicilio
                </Text>
              </Pressable>

              <Pressable
                onPress={() => toggleServiceMode('OFFICE')}
                style={[
                  styles.chip,
                  serviceModes.includes('OFFICE') ? styles.chipOn : styles.chipOff,
                ]}
                disabled={savingBy.serviceModes}
              >
                <Text
                  style={[
                    styles.chipT,
                    { color: serviceModes.includes('OFFICE') ? '#063A40' : '#9ec9cd' },
                  ]}
                >
                  En oficina / local
                </Text>
              </Pressable>

              <Pressable
                onPress={() => toggleServiceMode('ONLINE')}
                style={[
                  styles.chip,
                  serviceModes.includes('ONLINE') ? styles.chipOn : styles.chipOff,
                ]}
                disabled={savingBy.serviceModes}
              >
                <Text
                  style={[
                    styles.chipT,
                    { color: serviceModes.includes('ONLINE') ? '#063A40' : '#9ec9cd' },
                  ]}
                >
                  Online
                </Text>
              </Pressable>
            </View>

            {serviceModes.includes('HOME') && !backgroundCheckApproved ? (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255, 226, 155, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 226, 155, 0.25)',
                }}
              >
                <Text style={{ color: '#FFE29B', fontWeight: '800' }}>
                  Para ofrecer servicio a domicilio necesitás tener aprobado el certificado de buena
                  conducta.
                </Text>

                <Pressable
                  onPress={() => {
                    (navigation as any).navigate('Perfil', { screen: 'ProfileMain' });

                    setTimeout(() => {
                      (navigation as any).navigate('Perfil', { screen: 'BackgroundCheck' });
                    }, 0);
                  }}
                  style={[
                    styles.btn,
                    {
                      marginTop: 10,
                      backgroundColor: 'transparent',
                      borderWidth: 1,
                      borderColor: '#FFE29B',
                    },
                  ]}
                >
                  <Text style={[styles.btnT, { color: '#FFE29B' }]}>Cargar certificado</Text>
                </Pressable>
              </View>
            ) : null}

            {serviceModes.includes('OFFICE') && (
              <>
                <Text style={[styles.subTitle, { marginTop: 12 }]}>Dirección del local</Text>

                <TextInput
                  value={officeAddress}
                  onChangeText={setOfficeAddress}
                  placeholder="Calle y número (ej: San Martín 123)"
                  placeholderTextColor="#9ec9cd"
                  style={styles.input}
                  editable={!savingBy.serviceModes}
                />

                {savedOfficeAddress ? (
                  <View style={styles.savedInfoBox}>
                    <Text style={styles.savedInfoLabel}>Dirección actual guardada</Text>
                    <Text style={styles.savedInfoText}>{savedOfficeAddress}</Text>
                  </View>
                ) : (
                  <Text style={styles.muted}>
                    Aún no tenés una dirección de oficina/local guardada.
                  </Text>
                )}

                <Text style={[styles.subTitle, { marginTop: 10 }]}>Localidad</Text>

                <Pressable
                  style={styles.input}
                  onPress={() => {
                    setOfficeLocalityQuery('');
                    setOfficeLocalityOpen(true);
                  }}
                  disabled={savingBy.serviceModes}
                >
                  <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>
                    {officeLocality || 'Seleccionar localidad'}
                  </Text>
                </Pressable>

                <Modal
                  visible={officeLocalityOpen}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setOfficeLocalityOpen(false)}
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
                        value={officeLocalityQuery}
                        onChangeText={setOfficeLocalityQuery}
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

                      <RNScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                        {filteredOfficeLocalities.map((loc) => (
                          <Pressable
                            key={loc}
                            onPress={() => {
                              setOfficeLocality(loc);
                              setOfficeLocalityQuery('');
                              setOfficeLocalityOpen(false);
                            }}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 10,
                              borderRadius: 12,
                              backgroundColor:
                                loc === officeLocality ? 'rgba(6,73,79,0.10)' : 'transparent',
                              marginBottom: 6,
                            }}
                          >
                            <Text style={{ color: '#06494F', fontWeight: '800' }}>{loc}</Text>
                          </Pressable>
                        ))}
                      </RNScrollView>

                      <Pressable
                        onPress={() => {
                          setOfficeLocalityQuery('');
                          setOfficeLocalityOpen(false);
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
              </>
            )}

            <Pressable
              style={[
                styles.btn,
                (!serviceModesDirty || savingBy.serviceModes) && styles.btnDisabled,
              ]}
              onPress={saveServiceModes}
              disabled={!serviceModesDirty || savingBy.serviceModes}
            >
              {savingBy.serviceModes ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>Guardar modalidades</Text>
              )}
            </Pressable>
          </Section>

          {/* Rubros */}
          <Section
            title={`Rubros (${specialties.length})`}
            open={openRubros}
            onToggle={() =>
              setOpenRubros((v) => {
                const next = !v;
                if (!next) setSpecialtyQuery('');
                return next;
              })
            }
          >
            {openRubros ? (
              <>
                <Text style={styles.muted}>
                  Escribí parte del servicio para encontrarlo más rápido.
                </Text>

                <TextInput
                  value={specialtyQuery}
                  onChangeText={setSpecialtyQuery}
                  placeholder="Buscar rubro o servicio..."
                  placeholderTextColor="#9ec9cd"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />

                {selectedChipSource.length > 0 ? (
                  <>
                    <Text style={styles.subTitle}>Seleccionados ({selectedChipSource.length})</Text>

                    <View style={styles.chipsWrap}>
                      {selectedChipSource.map((opt) => (
                        <Pressable
                          key={`selected-${opt.slug}`}
                          onPress={() => toggleSpecialty(opt.slug)}
                          style={[styles.chip, styles.chipOn]}
                        >
                          <Text style={[styles.chipT, { color: '#063A40' }]}>{opt.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={styles.subTitle}>
                  {normalizedSpecialtyQuery ? 'Resultados' : 'Todos los rubros'}
                </Text>

                {filteredChipSource.length === 0 ? (
                  <Text style={styles.searchEmptyText}>No encontramos rubros con ese nombre.</Text>
                ) : (
                  <View style={styles.specialtiesScrollBox}>
                    <RNScrollView
                      style={styles.specialtiesInnerScroll}
                      contentContainerStyle={styles.specialtiesInnerContent}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.chipsWrap}>
                        {filteredChipSource.map((opt) => {
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
                    </RNScrollView>
                  </View>
                )}

                <Pressable
                  onPress={saveSpecialties}
                  disabled={!specialtiesDirty || savingBy.specialties}
                  style={[
                    styles.btn,
                    (!specialtiesDirty || savingBy.specialties) && styles.btnDisabled,
                  ]}
                >
                  {savingBy.specialties ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <ActivityIndicator />
                      <Text style={styles.btnT}>Guardando…</Text>
                    </View>
                  ) : (
                    <Text style={styles.btnT}>Guardar rubros</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={styles.muted}>Tocá para seleccionar o editar tus rubros.</Text>
            )}
          </Section>

          {/* Matrículas */}
          <Section
            title="Títulos, licencias o matrículas por rubro"
            open={openCerts}
            onToggle={() => {
              setOpenCerts((v) => {
                const next = !v;
                // ✅ si se está abriendo, cargamos certs (una sola vez)
                if (next) loadCertsOnce();
                return next;
              });
            }}
          >
            {certsLoading ? (
              <View style={{ paddingVertical: 10 }}>
                <ActivityIndicator color="#E9FEFF" />
                <Text style={[styles.muted, { marginTop: 8 }]}>Cargando certificados…</Text>
              </View>
            ) : specialtiesRequiringCert.length ? (
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

          {/* Trabajos realizados */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Trabajos realizados</Text>
              <Pressable
                onPress={async () => {
                  setPortfolioModalOpen(true);
                  await loadPortfolioOnce();
                }}
                style={{ padding: 6 }}
              >
                <Ionicons name="images-outline" size={20} color="#E9FEFF" />
              </Pressable>
            </View>

            <Text style={styles.muted}>
              Mostrá fotos de trabajos reales para generar más confianza en los clientes.
            </Text>

            <View
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(233,254,255,0.14)',
              }}
            >
              <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>
                {portfolio.length}/8 imágenes cargadas
              </Text>

              <Text style={[styles.muted, { marginTop: 4 }]}>
                Tocá para administrar tus fotos de trabajos realizados.
              </Text>

              <Pressable
                onPress={async () => {
                  setPortfolioModalOpen(true);
                  await loadPortfolioOnce();
                }}
                style={[styles.btn, { marginTop: 12 }]}
              >
                <Text style={styles.btnT}>Administrar imágenes</Text>
              </Pressable>
            </View>
          </View>

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
        </KeyboardAwareScrollView>
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
      {showSplitStartPicker && (
        <DateTimePicker
          value={timeStringToDate(splitStart)}
          mode="time"
          is24Hour
          onChange={(_, d) => {
            setShowSplitStartPicker(false);
            if (d) setSplitStart(dateToTimeString(d));
          }}
        />
      )}

      {showSplitEndPicker && (
        <DateTimePicker
          value={timeStringToDate(splitEnd)}
          mode="time"
          is24Hour
          onChange={(_, d) => {
            setShowSplitEndPicker(false);
            if (d) setSplitEnd(dateToTimeString(d));
          }}
        />
      )}

      {showSplitStart2Picker && (
        <DateTimePicker
          value={timeStringToDate(splitStart2)}
          mode="time"
          is24Hour
          onChange={(_, d) => {
            setShowSplitStart2Picker(false);
            if (d) setSplitStart2(dateToTimeString(d));
          }}
        />
      )}

      {showSplitEnd2Picker && (
        <DateTimePicker
          value={timeStringToDate(splitEnd2)}
          mode="time"
          is24Hour
          onChange={(_, d) => {
            setShowSplitEnd2Picker(false);
            if (d) setSplitEnd2(dateToTimeString(d));
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
                disabled={savingBy.avatar}
                onPress={confirmAvatar}
              >
                <Text style={styles.btnT}>{savingBy.avatar ? 'Subiendo…' : 'Usar foto'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: trabajos realizados */}
      <Modal
        transparent
        visible={portfolioModalOpen}
        animationType="fade"
        onRequestClose={() => setPortfolioModalOpen(false)}
      >
        <View style={styles.previewBG}>
          <View style={[styles.previewCard, { maxHeight: '85%' }]}>
            <View style={[styles.cardHeaderRow, { marginBottom: 10 }]}>
              <Text style={[styles.cardTitle, { color: '#0A5B63' }]}>Trabajos realizados</Text>
              <Pressable onPress={() => setPortfolioModalOpen(false)}>
                <Ionicons name="close" size={24} color="#0A5B63" />
              </Pressable>
            </View>

            <Text style={{ color: '#4A6C70', fontWeight: '700', marginBottom: 10 }}>
              {portfolio.length}/8 imágenes cargadas
            </Text>

            <Pressable
              style={[styles.btn, savingBy.portfolio && styles.btnDisabled, { marginTop: 0 }]}
              onPress={handleAddPortfolioImage}
              disabled={savingBy.portfolio || portfolio.length >= 8}
            >
              {savingBy.portfolio ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={styles.btnT}>Subiendo…</Text>
                </View>
              ) : (
                <Text style={styles.btnT}>
                  {portfolio.length >= 8 ? 'Límite alcanzado' : 'Agregar imagen'}
                </Text>
              )}
            </Pressable>

            <RNScrollView
              style={{ marginTop: 14 }}
              contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {portfolioLoading ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator />
                  <Text style={{ color: '#4A6C70', marginTop: 8 }}>Cargando imágenes…</Text>
                </View>
              ) : portfolio.length === 0 ? (
                <View style={{ paddingVertical: 20 }}>
                  <Text style={{ color: '#4A6C70', textAlign: 'center', fontWeight: '700' }}>
                    Aún no cargaste imágenes de trabajos realizados.
                  </Text>
                </View>
              ) : (
                portfolio.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      borderRadius: 14,
                      overflow: 'hidden',
                      backgroundColor: 'rgba(6,73,79,0.08)',
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        setPortfolioPreviewUri(absoluteUrl(item.imageUrl) ?? null);
                        setPortfolioPreviewOpen(true);
                      }}
                    >
                      <Image
                        source={{ uri: portfolioImageSource(item) }}
                        style={{ width: '100%', height: 180, backgroundColor: '#d9e6e7' }}
                        resizeMode="cover"
                      />
                    </Pressable>

                    <View style={{ padding: 10 }}>
                      <Text style={{ color: '#4A6C70', fontWeight: '700' }}>
                        {item.caption?.trim() || 'Trabajo realizado'}
                      </Text>

                      <Pressable
                        onPress={() =>
                          Alert.alert('Eliminar imagen', '¿Querés eliminar esta imagen?', [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                              text: 'Eliminar',
                              style: 'destructive',
                              onPress: () => handleDeletePortfolioImage(item.id),
                            },
                          ])
                        }
                        style={[
                          styles.btn,
                          {
                            marginTop: 10,
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            borderWidth: 1,
                            borderColor: 'rgba(239,68,68,0.25)',
                          },
                        ]}
                      >
                        <Text style={[styles.btnT, { color: '#B42318' }]}>Eliminar</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </RNScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: preview imagen portfolio */}
      <Modal
        transparent
        visible={portfolioPreviewOpen}
        animationType="fade"
        onRequestClose={() => setPortfolioPreviewOpen(false)}
      >
        <View style={styles.previewBG}>
          <View style={styles.previewCard}>
            {portfolioPreviewUri ? (
              <Image source={{ uri: portfolioPreviewUri }} style={styles.previewImg} />
            ) : null}

            <Pressable
              style={[styles.btn, { marginTop: 12 }]}
              onPress={() => {
                setPortfolioPreviewOpen(false);
                setPortfolioPreviewUri(null);
              }}
            >
              <Text style={styles.btnT}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal: preview antes de subir trabajo realizado */}
      <Modal
        transparent
        visible={portfolioUploadPreviewOpen}
        animationType="fade"
        onRequestClose={() => {
          if (savingBy.portfolio) return;
          setPortfolioUploadPreviewOpen(false);
          setPortfolioLocalUri(null);
        }}
      >
        <View style={styles.previewBG}>
          <View style={styles.previewCard}>
            {portfolioLocalUri ? (
              <Image source={{ uri: portfolioLocalUri }} style={styles.previewImg} />
            ) : null}

            <Text
              style={{
                color: '#0A5B63',
                fontWeight: '800',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              ¿Querés subir esta imagen a tus trabajos realizados?
            </Text>

            <View style={styles.previewRow}>
              <Pressable
                style={[styles.btn, { flex: 1, backgroundColor: 'rgba(10,91,99,0.12)' }]}
                disabled={savingBy.portfolio}
                onPress={() => {
                  setPortfolioUploadPreviewOpen(false);
                  setPortfolioLocalUri(null);
                }}
              >
                <Text style={[styles.btnT, { color: '#0A5B63' }]}>Cancelar</Text>
              </Pressable>

              <View style={{ width: 10 }} />

              <Pressable
                style={[styles.btn, { flex: 1 }]}
                disabled={savingBy.portfolio}
                onPress={confirmPortfolioImageUpload}
              >
                {savingBy.portfolio ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator />
                    <Text style={styles.btnT}>Subiendo…</Text>
                  </View>
                ) : (
                  <Text style={styles.btnT}>Usar imagen</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: faltan modalidades */}
      <Modal
        transparent
        visible={missingModesModalOpen}
        animationType="fade"
        onRequestClose={() => setMissingModesModalOpen(false)}
      >
        <View style={styles.previewBG}>
          <View style={styles.previewCard}>
            <Text
              style={{
                color: '#0A5B63',
                fontWeight: '900',
                fontSize: 18,
                textAlign: 'center',
              }}
            >
              Configurá tus modalidades
            </Text>

            <Text
              style={{
                color: '#4A6C70',
                fontWeight: '700',
                textAlign: 'center',
                marginTop: 10,
                lineHeight: 20,
              }}
            >
              Para completar tu perfil y poder activar tu visibilidad, primero tenés que indicar
              cómo ofrecés tu servicio: a domicilio, en local/oficina u online.
            </Text>

            <View style={styles.previewRow}>
              <Pressable
                style={[styles.btn, { flex: 1, backgroundColor: 'rgba(10,91,99,0.12)' }]}
                onPress={() => setMissingModesModalOpen(false)}
              >
                <Text style={[styles.btnT, { color: '#0A5B63' }]}>Ahora no</Text>
              </Pressable>

              <View style={{ width: 10 }} />

              <Pressable
                style={[styles.btn, { flex: 1 }]}
                onPress={() => {
                  setMissingModesModalOpen(false);
                  setOpenServiceModes(true);
                }}
              >
                <Text style={styles.btnT}>Configurar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: HOME requiere certificado */}
      <Modal
        transparent
        visible={homeBgRequiredModalOpen}
        animationType="fade"
        onRequestClose={() => setHomeBgRequiredModalOpen(false)}
      >
        <View style={styles.previewBG}>
          <View style={styles.previewCard}>
            <Text
              style={{
                color: '#0A5B63',
                fontWeight: '900',
                fontSize: 18,
                textAlign: 'center',
              }}
            >
              Servicio a domicilio
            </Text>

            <Text
              style={{
                color: '#4A6C70',
                fontWeight: '700',
                textAlign: 'center',
                marginTop: 10,
                lineHeight: 20,
              }}
            >
              Para ofrecer la modalidad a domicilio necesitás tener aprobado el certificado de buena
              conducta.
            </Text>

            <View style={styles.previewRow}>
              <Pressable
                style={[styles.btn, { flex: 1, backgroundColor: 'rgba(10,91,99,0.12)' }]}
                onPress={() => setHomeBgRequiredModalOpen(false)}
              >
                <Text style={[styles.btnT, { color: '#0A5B63' }]}>Entendido</Text>
              </Pressable>

              <View style={{ width: 10 }} />

              <Pressable
                style={[styles.btn, { flex: 1 }]}
                onPress={() => {
                  setHomeBgRequiredModalOpen(false);
                  (navigation as any).navigate('Perfil', { screen: 'ProfileMain' });

                  setTimeout(() => {
                    (navigation as any).navigate('Perfil', { screen: 'BackgroundCheck' });
                  }, 0);
                }}
              >
                <Text style={styles.btnT}>Ir al certificado</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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

  bellBtn: {
    position: 'relative',
    zIndex: 20,
  },
  bellHitArea: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  incompleteBannerWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },

  incompleteBanner: {
    backgroundColor: '#FFE29B',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  incompleteBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(90,62,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  incompleteBannerTitle: {
    color: '#5A3E00',
    fontSize: 14,
    fontWeight: '900',
  },

  incompleteBannerText: {
    color: '#5A3E00',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    lineHeight: 16,
  },

  incompleteBannerBtn: {
    backgroundColor: '#5A3E00',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'center',
  },

  incompleteBannerBtnText: {
    color: '#FFE29B',
    fontWeight: '900',
    fontSize: 12,
  },

  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 190 },

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

  searchEmptyText: {
    color: '#9ec9cd',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
    fontWeight: '700',
  },

  savedInfoBox: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.14)',
  },
  savedInfoLabel: {
    color: '#E9FEFF',
    fontWeight: '800',
    marginBottom: 4,
    fontSize: 12,
  },
  savedInfoText: {
    color: '#9ec9cd',
    fontWeight: '700',
    lineHeight: 18,
  },

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
  statusDotInline: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#00333A',
  },

  previewHeadline: {
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '800',
    marginTop: 4,
  },

  previewPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },

  previewPillSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(233,254,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.25)',
  },

  previewPillSoftText: {
    color: '#E9FEFF',
    fontWeight: '800',
  },

  previewPillSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.25)',
  },

  previewPillSolidText: {
    color: '#E9FEFF',
    fontWeight: '900',
  },

  previewPillGood: { backgroundColor: 'rgba(34, 197, 94, 0.22)' },
  previewPillBad: { backgroundColor: 'rgba(239, 68, 68, 0.18)' },
  avatarBox: { alignItems: 'center' },

  modeSwitchWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
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
  specialtiesScrollBox: {
    marginTop: 6,
    maxHeight: 260,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.12)',
    overflow: 'hidden',
  },

  specialtiesInnerScroll: {
    maxHeight: 260,
  },

  specialtiesInnerContent: {
    padding: 10,
  },
});
