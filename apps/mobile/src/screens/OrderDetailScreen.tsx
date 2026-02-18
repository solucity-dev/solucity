// apps/mobile/src/screens/OrderDetailScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { resolveUploadUrl } from '../lib/resolveUploadUrl';

type OrderEvent = { id: string; type: string; createdAt: string; payload?: any };

type OrderDetail = {
  id: string;
  status: string;
  description: string | null;
  isUrgent: boolean;
  preferredAt: string | null;
  scheduledAt: string | null;
  createdAt: string;

  service: {
    id: string;
    name: string;
    categoryName?: string | null;
    categorySlug?: string | null;
  } | null;

  customer: {
    id: string;
    name: string | null;
    avatarUrl?: string | null;
  } | null;

  specialist: {
    id: string;
    name: string | null;
    avatarUrl?: string | null;
  } | null;

  address: string | null;
  distanceKm?: number | null;

  jobLocation?: { lat: number; lng: number } | null;

  attachments: any[];
  events: OrderEvent[];
  rating: { score: number; comment: string | null } | null;
  chatThreadId?: string | null;

  serviceMode?: 'HOME' | 'OFFICE' | 'ONLINE';
};

type Resp = {
  ok: boolean;
  order: OrderDetail;
  meta?: {
    deadline: 'none' | 'active' | 'expired';
    timeLeftMs: number | null;
    deadlineAt: string | null;
  };
};

/**
 * ✅ Logger seguro solo en DEV
 */
const devLog = (...args: any[]) => {
  if (__DEV__) console.log(...args);
};

/**
 * ✅ Helper seguro para mostrar errores en Alert
 * Evita: "ReadableNativeMap to String"
 */
function getErrorMessage(e: any) {
  const data = e?.response?.data;
  if (!data) return e?.message || 'Error inesperado';
  if (typeof data === 'object' && typeof data.error === 'string') return data.error;
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return 'Error inesperado';
  }
}

const openInMapsCoords = async (lat: number, lng: number, label?: string) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    Alert.alert('Ubicación inválida', 'No hay coordenadas válidas para abrir en Maps.');
    return;
  }

  const safeLabel = (label ?? '').trim();
  const encodedLabel = encodeURIComponent(safeLabel);

  // Preferimos "query=lat,lng(label)" para que muestre pin y no haga búsquedas raras
  const webGoogle = safeLabel
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${encodedLabel})`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  const webAlt = safeLabel
    ? `https://maps.google.com/?q=${lat},${lng}(${encodedLabel})`
    : `https://maps.google.com/?q=${lat},${lng}`;

  const androidGeo = safeLabel
    ? `geo:${lat},${lng}?q=${lat},${lng}(${encodedLabel})`
    : `geo:${lat},${lng}?q=${lat},${lng}`;

  const iosApple = safeLabel
    ? `maps://?q=${encodedLabel}&ll=${lat},${lng}`
    : `maps://?ll=${lat},${lng}`;

  try {
    await Linking.openURL(webGoogle);
    return;
  } catch {}

  try {
    if (Platform.OS === 'android') {
      await Linking.openURL(androidGeo);
      return;
    }
    await Linking.openURL(iosApple);
    return;
  } catch {}

  try {
    await Linking.openURL(webAlt);
    return;
  } catch {}

  Alert.alert('No disponible', 'No se pudo abrir Maps en este dispositivo.');
};

const openInMaps = async (q: string) => {
  const query = (q ?? '').trim();
  if (!query) {
    Alert.alert('Dirección vacía', 'No hay una dirección válida para abrir en Maps.');
    return;
  }

  const encoded = encodeURIComponent(query);

  // URLs / intents
  const webGoogle = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const webAlt = `https://maps.google.com/?q=${encoded}`;
  const androidGeo = `geo:0,0?q=${encoded}`;
  const iosApple = `maps://?q=${encoded}`;

  // 1) Intento directo web (evita falso negativo de canOpenURL)
  try {
    await Linking.openURL(webGoogle);
    return;
  } catch {}

  // 2) Fallback por plataforma
  try {
    if (Platform.OS === 'android') {
      await Linking.openURL(androidGeo);
      return;
    }
    await Linking.openURL(iosApple);
    return;
  } catch {}

  // 3) Último fallback web
  try {
    await Linking.openURL(webAlt);
    return;
  } catch {}

  Alert.alert('No disponible', 'No se pudo abrir Maps en este dispositivo.');
};

/**
 * ✅ Mapeo estado REAL -> sección Agenda (NUEVO: review/finished)
 * Importante: coincide con la nueva lógica de AgendaScreen
 */
function mapStatusToAgendaSection(status?: string | null, meta?: Resp['meta']) {
  // si venció por deadline, lo tratamos como autocancel
  if (meta?.deadline === 'expired') return 'CANCELLED_AUTO';

  const s = String(status ?? 'PENDING')
    .trim()
    .toUpperCase();

  // Pendientes
  if (s === 'PENDING') return 'PENDING';

  // Confirmados/en curso
  if (['ASSIGNED', 'IN_PROGRESS', 'PAUSED'].includes(s)) return 'ASSIGNED';

  // Revisión
  if (['IN_CLIENT_REVIEW', 'FINISHED_BY_SPECIALIST'].includes(s)) return 'IN_CLIENT_REVIEW';

  // Finalizados
  if (['CONFIRMED_BY_CLIENT', 'CLOSED'].includes(s)) return 'CONFIRMED_BY_CLIENT';

  // ✅ Cancelados: devolvemos el status real (NO "CLOSED")
  if (['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SPECIALIST', 'CANCELLED_AUTO'].includes(s)) return s;

  // fallback
  return 'PENDING';
}

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth() as any;

  const tabBarHeightRaw = useBottomTabBarHeight();
  const tabBarHeight = Math.max(tabBarHeightRaw, 60);

  const orderId: string | null =
    route.params?.id ?? route.params?.orderId ?? route.params?.item?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrderDetail | null>(null);
  const [meta, setMeta] = useState<Resp['meta'] | undefined>(undefined);

  // ⭐ Rating modal
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingScore, setRatingScore] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // ✅ loading para acciones (botones)
  const [actionLoading, setActionLoading] = useState(false);

  // 🔍 Preview adjuntos
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const openPreview = (uri: string) => {
    setPreviewUri(uri);
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewUri(null);
  };

  // ✅ evita race conditions
  const loadSeqRef = useRef(0);

  // ✅ evita doble load al entrar (useEffect + focus)
  const didInitialLoadRef = useRef(false);

  // ✅ salta el primer focus después de montar la pantalla
  const skipNextFocusReloadRef = useRef(true);

  // ✅ evita refresh duplicado por focus
  const lastFocusReloadRef = useRef<number>(0);

  // ✅ evita procesar el mismo refreshAt dos veces
  const lastRefreshAtHandledRef = useRef<number>(0);

  // ✅ cache de permiso + coordenadas para no pedir GPS siempre
  const locPermRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');
  const locCacheRef = useRef<{ ts: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    try {
      devLog('[OrderDetail] route.params =', JSON.stringify(route.params ?? {}, null, 2));
    } catch {
      devLog('[OrderDetail] route.params keys =', Object.keys(route.params ?? {}));
    }
    devLog('[OrderDetail] resolved orderId =', orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * ✅ Volver SIEMPRE a AgendaMain y apuntar al tab correcto
   * Importante: AgendaScreen espera initialSection con status backend.
   */
  const handleBackToAgenda = useCallback(
    (forceStatus?: string | null, forceMeta?: Resp['meta']) => {
      const targetStatus = mapStatusToAgendaSection(forceStatus ?? data?.status, forceMeta ?? meta);

      // 1) si existe AgendaMain en el stack actual
      try {
        nav.navigate('AgendaMain', { initialSection: targetStatus, refresh: true });
        return true;
      } catch {}

      // 2) si puedo volver atrás
      if (nav.canGoBack?.()) {
        nav.goBack();
        return true;
      }

      // 3) navegar via parent navigator
      const parent = nav.getParent?.();
      if (parent?.navigate) {
        parent.navigate('Agenda', {
          screen: 'AgendaMain',
          params: { initialSection: targetStatus, refresh: true },
        });
        return true;
      }

      // 4) fallback
      nav.navigate('Agenda', { initialSection: targetStatus, refresh: true });
      return true;
    },
    [nav, data?.status, meta],
  );

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => handleBackToAgenda());
      return () => sub.remove();
    }, [handleBackToAgenda]),
  );

  const load = async (id: string) => {
    const tAll = Date.now();
    devLog('[OrderDetail][perf] LOAD_START', { id });
    devLog('[OrderDetail][load] start id =', id);

    const seq = ++loadSeqRef.current;
    devLog('[OrderDetail][load] seq =', seq);

    try {
      setLoading(true);
      setError(null);

      let url = `/orders/${id}`;

      // ⏱️ Medición ubicación: declararla afuera para que exista en catch/finally
      let tLoc = 0;

      try {
        tLoc = Date.now();

        // ✅ permiso: pedir UNA vez (cache)
        if (locPermRef.current === 'unknown') {
          const { status } = await Location.getForegroundPermissionsAsync();
          locPermRef.current = status === 'granted' ? 'granted' : 'denied';
        }

        if (locPermRef.current === 'granted') {
          const now = Date.now();
          const cached = locCacheRef.current;

          // ✅ usar cache 60s
          if (cached && now - cached.ts < 60_000) {
            url = `/orders/${id}?lat=${encodeURIComponent(cached.lat)}&lng=${encodeURIComponent(
              cached.lng,
            )}`;
            devLog('[OrderDetail][loc] using cached coords');
          } else {
            // ✅ intentar last known (más rápido que GPS)
            const last = await Location.getLastKnownPositionAsync({});
            if (last?.coords?.latitude && last?.coords?.longitude) {
              locCacheRef.current = {
                ts: now,
                lat: last.coords.latitude,
                lng: last.coords.longitude,
              };
              url = `/orders/${id}?lat=${encodeURIComponent(last.coords.latitude)}&lng=${encodeURIComponent(
                last.coords.longitude,
              )}`;
              devLog('[OrderDetail][loc] using lastKnown coords');
            } else {
              // ✅ fallback GPS real
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              locCacheRef.current = {
                ts: now,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              };
              url = `/orders/${id}?lat=${encodeURIComponent(pos.coords.latitude)}&lng=${encodeURIComponent(
                pos.coords.longitude,
              )}`;
              devLog('[OrderDetail][loc] using fresh GPS coords');
            }
          }
        } else {
          devLog('[OrderDetail] ubicación no permitida, se llama sin lat/lng');
        }
      } catch (locErr) {
        devLog('[OrderDetail] error obteniendo ubicación', locErr);
      } finally {
        if (tLoc) devLog('[OrderDetail][perf] location ms =', Date.now() - tLoc);
      }

      devLog('[OrderDetail][load] GET =>', url);

      const tApi = Date.now(); // ⏱️ inicio medición API

      const r = await api.get<Resp>(url, {
        headers: { 'Cache-Control': 'no-cache' },
      });

      devLog('[OrderDetail][perf] GET /orders ms =', Date.now() - tApi);
      devLog('[OrderDetail][perf] LOAD_END', { id, totalMs: Date.now() - tAll });

      if (seq !== loadSeqRef.current) {
        devLog('[OrderDetail][load] ignored result (stale seq)', {
          seq,
          current: loadSeqRef.current,
        });
        return null;
      }

      devLog('[OrderDetail][load] response.ok =', r.data?.ok);
      devLog('[OrderDetail][load] order.status =', r.data?.order?.status);
      devLog('[OrderDetail][load] meta.deadline =', r.data?.meta?.deadline);

      setData(r.data.order);
      devLog('[OrderDetail][shape]', {
        status: r.data?.order?.status,
        customer: r.data?.order?.customer,
        specialist: r.data?.order?.specialist,
        service: r.data?.order?.service,
      });

      devLog('[OrderDetail][address check]', {
        address: r.data?.order?.address,
        serviceMode: r.data?.order?.serviceMode,
      });

      setMeta(r.data.meta);
      return r.data;
    } catch (e: any) {
      if (seq !== loadSeqRef.current) return null;
      const msg = getErrorMessage(e) ?? 'Error al cargar la orden';
      devLog('[OrderDetail][load] ERROR =', msg);
      setError(msg);
      return null;
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!orderId) {
      setError('Orden sin id (parámetros faltantes desde la navegación)');
      setLoading(false);
      return;
    }

    // ✅ si venís con refreshAt (notificación), NO dispares el load acá.
    const ra = route.params?.refreshAt ? Number(route.params.refreshAt) : 0;
    if (ra) {
      devLog('[OrderDetail][effect] skipped initial (refreshAt present)', { ra });

      didInitialLoadRef.current = false;
      return;
    }

    // 🔥 FIX FINAL
    if (lastRefreshAtHandledRef.current) {
      devLog('[OrderDetail][effect] skipped initial (already handled refreshAt)', {
        handled: lastRefreshAtHandledRef.current,
      });
      return;
    }

    // reset total al cambiar de orden
    didInitialLoadRef.current = false;
    lastRefreshAtHandledRef.current = 0;

    devLog('[OrderDetail][effect] initial load for orderId =', orderId);
    didInitialLoadRef.current = true;
    skipNextFocusReloadRef.current = true;

    load(orderId);
  }, [orderId, route.params?.refreshAt]);

  // ✅ refrescar al entrar (notif / focus) sin duplicar
  useFocusEffect(
    useCallback(() => {
      if (!orderId) return;

      const now = Date.now();

      // 1️⃣ refreshAt → prioridad absoluta
      const ra = route.params?.refreshAt ? Number(route.params.refreshAt) : 0;
      if (ra && ra !== lastRefreshAtHandledRef.current) {
        lastRefreshAtHandledRef.current = ra;

        devLog('[OrderDetail][focus] refreshAt detected -> forcing load', { ra });

        didInitialLoadRef.current = true; // ✅ clave: ya hicimos “la carga inicial”
        lastFocusReloadRef.current = Date.now(); // ✅ bloquea el refresh normal inmediato

        load(orderId);

        nav.setParams({ refreshAt: undefined }); // consume
        return;
      }

      // 🚫 saltar el primer focus después del mount
      if (skipNextFocusReloadRef.current) {
        skipNextFocusReloadRef.current = false;
        devLog('[OrderDetail][focus] skipped (first focus)');
        return;
      }

      // 2️⃣ evitar reload inmediato al entrar
      if (!didInitialLoadRef.current) {
        devLog('[OrderDetail][focus] skipped (waiting initial load)');
        return;
      }

      // 3️⃣ throttle normal
      if (now - lastFocusReloadRef.current < 1200) {
        devLog('[OrderDetail][focus] skipped (throttled)');
        return;
      }

      lastFocusReloadRef.current = now;
      devLog('[OrderDetail][focus] refresh load for orderId =', orderId);
      load(orderId);
    }, [orderId, route.params?.refreshAt, nav]),
  );

  const fmtDateTime = (iso?: string | null) =>
    !iso
      ? '—'
      : new Date(iso).toLocaleString([], {
          dateStyle: 'short',
          timeStyle: 'short',
        });

  const eventTypeLabel = (type: string) => {
    const t = String(type || '').toUpperCase();
    const map: Record<string, string> = {
      CREATED: 'Creado',
      ACCEPTED: 'Aceptado',
      ASSIGNED: 'Asignado',
      IN_PROGRESS: 'En curso',
      PAUSED: 'Pausado',
      FINISHED_BY_SPECIALIST: 'Finalizado por especialista',
      IN_CLIENT_REVIEW: 'En revisión del cliente',
      CONFIRMED_BY_CLIENT: 'Confirmado por cliente',
      REJECTED: 'Rechazado',
      CANCELLED_BY_CUSTOMER: 'Cancelado por cliente',
      CANCELLED_BY_SPECIALIST: 'Cancelado por especialista',
      CANCELLED_AUTO: 'Vencido automáticamente',
      CLOSED: 'Cerrado',
      RATED: 'Calificado',
    };
    return map[t] ?? type;
  };

  // ✅ rol REAL
  const isSpecialist = user?.role === 'SPECIALIST';
  const isClient = !isSpecialist;

  const isExpired = meta?.deadline === 'expired';
  const status = String(data?.status ?? 'PENDING').toUpperCase();

  const serviceMode = data?.serviceMode ?? 'HOME';
  const isModeOffice = serviceMode === 'OFFICE';
  const isModeOnline = serviceMode === 'ONLINE';

  const isPending = status === 'PENDING';
  const isAssignedOrInProgress =
    status === 'ASSIGNED' || status === 'IN_PROGRESS' || status === 'PAUSED';

  // ✅ ahora revisión es su propio estado/tarjeta/tab
  const inClientReview = status === 'IN_CLIENT_REVIEW' || status === 'FINISHED_BY_SPECIALIST';

  // ✅ finalizados (en agenda "finished")
  const isFinished = status === 'CONFIRMED_BY_CLIENT' || status === 'CLOSED';

  // ✅ rating (si confirmó y aún no calificó)
  const canRate = status === 'CONFIRMED_BY_CLIENT' && !data?.rating;

  const isAutoCancelled = status === 'CANCELLED_AUTO';
  const isCancelledByCustomer = status === 'CANCELLED_BY_CUSTOMER';
  const isCancelledBySpecialist = status === 'CANCELLED_BY_SPECIALIST';

  const isCancelled =
    isExpired || isAutoCancelled || isCancelledByCustomer || isCancelledBySpecialist;

  const statusTitle = isExpired
    ? 'Pedido vencido'
    : isAutoCancelled
      ? 'Pedido vencido'
      : isCancelledByCustomer
        ? 'Pedido cancelado por el cliente'
        : isCancelledBySpecialist
          ? 'Pedido cancelado por el especialista'
          : isPending
            ? 'Pedido pendiente'
            : isAssignedOrInProgress
              ? 'Pedido en curso'
              : inClientReview
                ? 'En revisión del cliente'
                : status === 'CONFIRMED_BY_CLIENT'
                  ? 'Trabajo confirmado'
                  : status === 'CLOSED'
                    ? 'Pedido cerrado'
                    : 'Detalle del pedido';

  const headerName = isClient
    ? (data?.specialist?.name ?? 'Especialista a asignar')
    : (data?.customer?.name ?? 'Cliente');

  const headerAvatarUrl = isClient
    ? (data?.specialist?.avatarUrl ?? null)
    : (data?.customer?.avatarUrl ?? null);

  const headerAvatarResolved = useMemo(
    () => resolveUploadUrl(headerAvatarUrl ?? null),
    [headerAvatarUrl],
  );

  const headerInitial = (headerName?.trim?.()[0] ?? 'U').toUpperCase();

  const horarioLabel = (() => {
    if (!data) return '—';
    if (data.isUrgent) return 'Lo antes posible';
    if (data.scheduledAt) return fmtDateTime(data.scheduledAt);
    if (data.preferredAt) return fmtDateTime(data.preferredAt);
    return 'Sin definir';
  })();

  const distanceLabel = (() => {
    if (!data) return 'No disponible';
    const d = data.distanceKm;
    if (d == null || Number.isNaN(d)) return 'No disponible';
    if (d < 1) return `${Math.round(d * 1000)} m`;
    if (d < 10) return `${d.toFixed(1)} km`;
    return `${Math.round(d)} km`;
  })();

  // 🔥 Mostrar distancia solo si:
  // - No es ONLINE
  // - No está pendiente
  // - Hay distancia válida
  const shouldShowDistance = !isModeOnline && !isPending && distanceLabel !== 'No disponible';

  const deadlinePill = useMemo(() => {
    if (!meta || meta.deadline === 'none') return { text: 'Sin límite', style: styles.badgeSoft };
    if (meta.deadline === 'expired' || !meta.timeLeftMs || meta.timeLeftMs <= 0)
      return { text: 'Límite vencido', style: styles.badgeWarn };

    const totalMinutes = Math.max(0, Math.round(meta.timeLeftMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (hours) parts.push(`${hours} h`);
    if (minutes || !hours) parts.push(`${minutes} min`);

    return { text: `Límite: ${parts.join(' ')}`, style: styles.badgeOk };
  }, [meta]);

  const attachmentImages: string[] = useMemo(() => {
    if (!data || !Array.isArray(data.attachments)) return [];

    return data.attachments
      .map((att: any) => {
        if (!att) return null;

        const raw =
          typeof att === 'string'
            ? att
            : typeof att.uri === 'string'
              ? att.uri
              : typeof att.url === 'string'
                ? att.url
                : typeof att.fileUrl === 'string'
                  ? att.fileUrl
                  : null;

        return raw ? resolveUploadUrl(raw) : null;
      })
      .filter((u): u is string => typeof u === 'string');
  }, [data]);

  const addressText = (() => {
    const a = data?.address;
    if (!a) return '—';
    if (typeof a === 'string') return a.trim() || '—';
    return '—';
  })();

  // 🔥 Mostrar dirección solo si:
  // - NO está pendiente
  // - NO es modalidad ONLINE
  // - Existe dirección válida
  const shouldShowAddress = !isPending && !isModeOnline && addressText !== '—';

  // ✅ Chat disponible por estado
  // ✅ Chat disponible si no está pendiente/cancelada y existe thread
  const canShowChat = !isPending && !isCancelled && !!data?.chatThreadId;

  const confirmAction = ({
    title,
    message,
    confirmText = 'Confirmar',
    destructive = true,
    onConfirm,
  }: {
    title: string;
    message: string;
    confirmText?: string;
    destructive?: boolean;
    onConfirm: () => void;
  }) => {
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  };

  const confirmCancel = (onConfirm: () => void) =>
    confirmAction({
      title: '¿Cancelar solicitud?',
      message: 'Esta acción cancelará la orden. ¿Seguro que querés continuar?',
      confirmText: 'Sí, cancelar',
      destructive: true,
      onConfirm,
    });

  // ───────────────────── Acciones (con loading seguro) ─────────────────────
  const runAction = async (fn: () => Promise<void>) => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      await fn();
    } finally {
      setActionLoading(false);
    }
  };

  const doAccept = async () =>
    runAction(async () => {
      if (!data) return;
      await api.post(`/orders/${data.id}/accept`, {});
      Alert.alert('Listo', 'Pedido aceptado');
      const fresh = orderId ? await load(orderId) : null;
      handleBackToAgenda(fresh?.order?.status ?? 'ASSIGNED', fresh?.meta);
    });

  const doRejectAsSpecialist = async () =>
    runAction(async () => {
      if (!data) return;

      try {
        await api.post(`/orders/${data.id}/cancel-by-specialist`, {
          reason: 'Rechazado por el especialista',
        });

        Alert.alert('Listo', 'Solicitud rechazada');

        const fresh = orderId ? await load(orderId) : null;
        handleBackToAgenda(fresh?.order?.status ?? 'CANCELLED_BY_SPECIALIST', fresh?.meta);
      } catch (e: any) {
        console.log(
          '❌ [cancel-by-specialist][REJECT]',
          'status =',
          e?.response?.status,
          'data =',
          e?.response?.data,
        );
        throw e;
      }
    });

  const doCancelAsCustomer = async () =>
    runAction(async () => {
      if (!data) return;
      await api.post(`/orders/${data.id}/cancel`, { reason: 'Cancelado por el cliente' });
      Alert.alert('Listo', 'Solicitud cancelada');
      const fresh = orderId ? await load(orderId) : null;
      handleBackToAgenda(fresh?.order?.status ?? 'CANCELLED_BY_CUSTOMER', fresh?.meta);
    });

  const doCancelAsSpecialist = async () =>
    runAction(async () => {
      if (!data) return;
      await api.post(`/orders/${data.id}/cancel-by-specialist`, {
        reason: 'Cancelado por el especialista',
      });
      Alert.alert('Listo', 'Solicitud cancelada');
      const fresh = orderId ? await load(orderId) : null;
      handleBackToAgenda(fresh?.order?.status ?? 'CANCELLED_BY_SPECIALIST', fresh?.meta);
    });

  const doFinish = async () =>
    runAction(async () => {
      if (!data) return;
      await api.post(`/orders/${data.id}/finish`, { attachments: [], note: null });
      Alert.alert('Listo', 'Trabajo marcado como finalizado');
      const fresh = orderId ? await load(orderId) : null;
      // 🔥 se va a "Revisión"
      handleBackToAgenda(fresh?.order?.status ?? 'IN_CLIENT_REVIEW', fresh?.meta);
    });

  const doConfirm = async () =>
    runAction(async () => {
      if (!data) return;
      await api.post(`/orders/${data.id}/confirm`, {});
      Alert.alert('Listo', 'Trabajo confirmado');
      const fresh = orderId ? await load(orderId) : null;

      // si falta rating, abrimos modal y NO navegamos todavía
      if (fresh?.order && !fresh.order.rating) {
        setRatingScore(5);
        setRatingComment('');
        setRatingModalVisible(true);
        return;
      }

      handleBackToAgenda(fresh?.order?.status ?? 'CONFIRMED_BY_CLIENT', fresh?.meta);
    });

  const doRejectFinishAsCustomer = async () =>
    runAction(async () => {
      if (!data) return;
      await api.post(`/orders/${data.id}/reject`, { reason: 'El cliente rechazó la finalización' });
      Alert.alert('Listo', 'Se rechazó la finalización. El trabajo volvió a estar en curso.');
      const fresh = orderId ? await load(orderId) : null;
      handleBackToAgenda(fresh?.order?.status ?? 'IN_PROGRESS', fresh?.meta);
    });

  const submitRating = async () => {
    if (!data) return;
    if (submittingRating) return;

    try {
      setSubmittingRating(true);
      await api.post(`/orders/${data.id}/rate`, {
        score: ratingScore,
        comment: ratingComment.trim() || null,
      });
      setRatingModalVisible(false);
      Alert.alert('Gracias', 'Calificación enviada');
      const fresh = orderId ? await load(orderId) : null;
      handleBackToAgenda(fresh?.order?.status ?? 'CLOSED', fresh?.meta);
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo calificar');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleOpenChat = async () => {
    if (!data || !canShowChat) return;

    let threadId = data.chatThreadId ?? null;
    if (!threadId) {
      const fresh = orderId ? await load(orderId) : null;
      threadId = fresh?.order?.chatThreadId ?? null;
    }

    if (!threadId) {
      Alert.alert(
        'Chat no disponible',
        'Todavía no se creó el chat para esta orden. Probá de nuevo.',
      );
      return;
    }

    const parent = nav.getParent?.();
    const title = isSpecialist
      ? (data.customer?.name ?? data.service?.name ?? 'Chat')
      : (data.specialist?.name ?? data.service?.name ?? 'Chat');

    const params = { threadId, orderId: data.id, title };

    if (parent?.navigate) {
      parent.navigate('Chat', { screen: 'ChatThread', params });
      return;
    }

    nav.navigate('ChatThread', params);
  };

  // ───────────────────── Estados UI (BOTONES) ─────────────────────
  const showPendingSpecialistActions = isPending && !isCancelled && isSpecialist;
  const showPendingCustomerActions = isPending && !isCancelled && isClient;

  // ✅ Confirmados: ambos pueden cancelar + chat, especialista puede finalizar
  const showConfirmedActions = isAssignedOrInProgress && !isCancelled;

  // ✅ Revisión: cliente confirma o rechaza, ambos pueden chat/cancelar (cancelar opcional)
  const showClientReviewActions = inClientReview && !isCancelled && isClient;

  // ✅ CTA extra: si confirmó y no calificó (puede quedar en finished)
  const showRateActions = canRate && !isCancelled;

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color="#E9FEFF" />
          <Text style={{ color: '#E9FEFF', marginTop: 8 }}>Cargando orden…</Text>

          <Pressable
            onPress={() => handleBackToAgenda()}
            style={[styles.retryBtn, { marginTop: 16 }]}
          >
            <Text style={styles.retryText}>Volver a Agenda</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error || !data) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center}>
          <Text style={{ color: '#FFECEC', fontWeight: '800' }}>Error</Text>
          <Text style={{ color: '#FFECEC', marginTop: 6 }}>{error ?? 'No se pudo cargar'}</Text>

          <Pressable onPress={() => orderId && load(orderId)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>

          <Pressable
            onPress={() => handleBackToAgenda()}
            style={[styles.retryBtn, { marginTop: 10 }]}
          >
            <Text style={styles.retryText}>Volver a Agenda</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const rubroLabel = data.service?.categoryName ?? data.service?.name ?? 'Sin datos';

  const primaryDisabled = actionLoading || submittingRating;
  const secondaryDisabled = actionLoading || submittingRating;

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => handleBackToAgenda()} style={{ padding: 6, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>

          <Text style={styles.brand}>Detalle del pedido</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 14,
            paddingBottom: tabBarHeight + insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <View>
                <Text style={styles.title}>{statusTitle}</Text>
              </View>
              <View style={[styles.badge, deadlinePill.style]}>
                <Text style={styles.badgeText}>{deadlinePill.text}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              {headerAvatarResolved ? (
                <ExpoImage
                  source={{ uri: headerAvatarResolved }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  onError={(e) =>
                    devLog('[OrderDetail][AVATAR][ERROR]', headerAvatarResolved, e?.error)
                  }
                />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{headerInitial}</Text>
                </View>
              )}

              <View style={{ marginLeft: 12 }}>
                <Text style={styles.clientName}>{headerName}</Text>
              </View>
            </View>

            <View style={{ height: 10 }} />

            {shouldShowDistance && (
              <View style={styles.row}>
                <Ionicons name="location-outline" size={18} color="#E9FEFF" />
                <Text style={styles.muted}>Distancia: {distanceLabel}</Text>
              </View>
            )}

            <View style={styles.row}>
              <MDI name="calendar-clock" size={18} color="#E9FEFF" />
              <Text style={styles.muted}>Horario: {rubroLabel ? horarioLabel : horarioLabel}</Text>
            </View>

            <View style={styles.row}>
              <Ionicons
                name="flash-outline"
                size={18}
                color={data.isUrgent ? '#ffe164' : '#E9FEFF'}
              />
              <Text style={styles.muted}>{data.isUrgent ? 'Urgente' : 'Normal'}</Text>
            </View>

            <View style={styles.row}>
              <MDI name="clipboard-text-outline" size={18} color="#E9FEFF" />
              <Text style={styles.muted}>Rubro: {rubroLabel}</Text>
            </View>
            {isModeOnline ? (
              <View style={styles.row}>
                <Ionicons name="laptop-outline" size={18} color="#E9FEFF" />
                <Text style={styles.muted}>Modalidad: Servicio Online</Text>
              </View>
            ) : shouldShowAddress ? (
              <View style={styles.row}>
                <Ionicons name="home-outline" size={18} color="#E9FEFF" />
                <Text style={styles.muted}>
                  {isModeOffice ? 'Dirección del local: ' : 'Dirección: '}
                  {addressText}
                </Text>
              </View>
            ) : null}

            {shouldShowAddress && (
              <Pressable
                onPress={() => {
                  const jl = data?.jobLocation;
                  if (jl?.lat != null && jl?.lng != null) {
                    openInMapsCoords(jl.lat, jl.lng, addressText !== '—' ? addressText : undefined);
                    return;
                  }
                  // fallback (si por algún motivo no vinieron coords)
                  openInMaps(addressText);
                }}
                style={[styles.ctaAlt, { marginTop: 10 }]}
              >
                <Text style={styles.ctaAltText}>Abrir en Google Maps</Text>
              </Pressable>
            )}

            {data.description && (
              <>
                <View style={{ height: 12 }} />
                <Text style={styles.sectionTitle}>Descripción del problema</Text>
                <Text style={styles.textBody}>{data.description}</Text>
              </>
            )}

            {attachmentImages.length > 0 && (
              <>
                <View style={{ height: 12 }} />
                <Text style={styles.sectionTitle}>Adjuntos</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 8 }}
                >
                  {attachmentImages.map((uri, idx) => (
                    <Pressable
                      key={`${uri}-${idx}`}
                      onPress={() => openPreview(uri)}
                      style={{ marginRight: 10 }}
                    >
                      <ExpoImage
                        source={{ uri }}
                        style={styles.attachmentImage}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                        onError={(e) => devLog('[OrderDetail][ATTACH][ERROR]', uri, e?.error)}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {isCancelled && (
              <>
                <View style={{ height: 12 }} />
                <Text style={styles.sectionTitle}>Estado</Text>
                <Text style={styles.textBody}>La solicitud está vencida o cancelada.</Text>
              </>
            )}

            {isFinished && !isCancelled && (
              <>
                <View style={{ height: 12 }} />
                <Text style={styles.sectionTitle}>Estado</Text>
                <Text style={styles.textBody}>Este trabajo ya se encuentra finalizado.</Text>
              </>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <MDI name="timeline-clock-outline" size={18} color="#E9FEFF" />
              <Text style={styles.cardTitle}>Actividad</Text>
            </View>

            {data.events.length === 0 ? (
              <Text style={styles.muted}>Sin eventos aún.</Text>
            ) : (
              data.events.map((ev) => (
                <View key={ev.id} style={styles.eventRow}>
                  <Text style={styles.eventType}>{eventTypeLabel(ev.type)}</Text>
                  <Text style={styles.eventWhen}>{fmtDateTime(ev.createdAt)}</Text>
                </View>
              ))
            )}

            {data.rating && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.sectionTitle}>Reseña</Text>

                <Text style={styles.textBody}>⭐ {data.rating.score}/5</Text>

                {data.rating.comment ? (
                  <Text style={[styles.textBody, { marginTop: 4 }]}>{data.rating.comment}</Text>
                ) : (
                  <Text style={styles.muted}>Sin comentario.</Text>
                )}
              </View>
            )}
          </View>

          {/* ───────────── BOTONES (ordenados por flujo) ───────────── */}
          <View style={{ gap: 10 }}>
            {/* PENDIENTE - ESPECIALISTA */}
            {showPendingSpecialistActions && (
              <>
                <Pressable
                  style={[styles.ctaPrimary, primaryDisabled && styles.ctaDisabled]}
                  onPress={doAccept}
                  disabled={primaryDisabled}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#06494F" />
                  ) : (
                    <Text style={styles.ctaPrimaryText}>Aceptar pedido</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.ctaDanger, secondaryDisabled && styles.ctaDisabled]}
                  onPress={() =>
                    confirmAction({
                      title: '¿Rechazar solicitud?',
                      message:
                        'El cliente será notificado y la solicitud se marcará como rechazada. ¿Querés continuar?',
                      confirmText: 'Sí, rechazar',
                      destructive: true,
                      onConfirm: doRejectAsSpecialist,
                    })
                  }
                  disabled={secondaryDisabled}
                >
                  <Text style={styles.ctaDangerText}>Rechazar solicitud</Text>
                </Pressable>
              </>
            )}

            {/* PENDIENTE - CLIENTE */}
            {showPendingCustomerActions && (
              <Pressable
                style={[styles.ctaDanger, secondaryDisabled && styles.ctaDisabled]}
                onPress={() => confirmCancel(doCancelAsCustomer)}
                disabled={secondaryDisabled}
              >
                <Text style={styles.ctaDangerText}>Cancelar solicitud</Text>
              </Pressable>
            )}

            {/* CONFIRMADOS - ambos */}
            {showConfirmedActions && (
              <>
                {/* Cancelar */}
                {isClient ? (
                  <Pressable
                    style={[styles.ctaDanger, secondaryDisabled && styles.ctaDisabled]}
                    onPress={() => confirmCancel(doCancelAsCustomer)}
                    disabled={secondaryDisabled}
                  >
                    <Text style={styles.ctaDangerText}>Cancelar solicitud</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.ctaDanger, secondaryDisabled && styles.ctaDisabled]}
                    onPress={() => confirmCancel(doCancelAsSpecialist)}
                    disabled={secondaryDisabled}
                  >
                    <Text style={styles.ctaDangerText}>Cancelar solicitud</Text>
                  </Pressable>
                )}

                {/* Finalizar (solo especialista) */}
                {isSpecialist && (
                  <Pressable
                    style={[styles.ctaPrimary, primaryDisabled && styles.ctaDisabled]}
                    onPress={doFinish}
                    disabled={primaryDisabled}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#06494F" />
                    ) : (
                      <Text style={styles.ctaPrimaryText}>Marcar como finalizado</Text>
                    )}
                  </Pressable>
                )}
              </>
            )}

            {/* REVISIÓN - cliente */}
            {showClientReviewActions && (
              <>
                <Pressable
                  style={[styles.ctaPrimary, primaryDisabled && styles.ctaDisabled]}
                  onPress={doConfirm}
                  disabled={primaryDisabled}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#06494F" />
                  ) : (
                    <Text style={styles.ctaPrimaryText}>Confirmar y calificar trabajo</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.ctaAlt, secondaryDisabled && styles.ctaDisabledAlt]}
                  onPress={() =>
                    confirmAction({
                      title: '¿Rechazar finalización?',
                      message:
                        'El especialista va a ser notificado y el trabajo volverá a estar en curso. ¿Querés continuar?',
                      confirmText: 'Sí, rechazar',
                      destructive: true,
                      onConfirm: doRejectFinishAsCustomer,
                    })
                  }
                >
                  <Text style={styles.ctaAltText}>Rechazar finalización</Text>
                </Pressable>
              </>
            )}

            {/* FINALIZADO - si falta rating */}
            {showRateActions && (
              <Pressable
                style={[styles.ctaPrimary, primaryDisabled && styles.ctaDisabled]}
                onPress={() => {
                  setRatingScore(5);
                  setRatingComment('');
                  setRatingModalVisible(true);
                }}
                disabled={primaryDisabled}
              >
                <Text style={styles.ctaPrimaryText}>Calificar y cerrar</Text>
              </Pressable>
            )}

            {/* ✅ Chat global: visible para ambos roles cuando corresponde */}
            {canShowChat && (
              <Pressable
                style={[styles.ctaAlt, primaryDisabled && styles.ctaDisabledAlt]}
                onPress={handleOpenChat}
                disabled={primaryDisabled}
              >
                <Text style={styles.ctaAltText}>Ir al chat</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        {/* 🔍 Modal preview adjunto */}
        <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={closePreview}>
          <View style={styles.previewBackdrop}>
            {/* Tap afuera cierra */}
            <Pressable style={StyleSheet.absoluteFill} onPress={closePreview} />

            {/* Barra superior con X */}
            <View style={styles.previewTopBar}>
              <Pressable onPress={closePreview} style={{ padding: 8 }}>
                <Ionicons name="close" size={26} color="#E9FEFF" />
              </Pressable>
            </View>

            {/* Imagen grande */}
            {previewUri ? (
              <ExpoImage
                source={{ uri: previewUri }}
                style={styles.previewImage}
                contentFit="contain"
                transition={150}
                cachePolicy="memory-disk"
              />
            ) : null}
          </View>
        </Modal>

        {/* ⭐ Modal de rating */}
        <Modal
          visible={ratingModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setRatingModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Calificar especialista</Text>
              <Text style={styles.modalSubtitle}>
                Contanos cómo fue tu experiencia con el trabajo realizado.
              </Text>

              <View style={styles.modalStarsRow}>
                {[1, 2, 3, 4, 5].map((val) => (
                  <Pressable
                    key={val}
                    style={styles.starButton}
                    onPress={() => setRatingScore(val)}
                  >
                    <Ionicons
                      name={val <= ratingScore ? 'star' : 'star-outline'}
                      size={28}
                      color="#FFE164"
                    />
                  </Pressable>
                ))}
              </View>

              <Text style={styles.modalLabel}>Comentario (opcional)</Text>
              <TextInput
                style={styles.modalInput}
                multiline
                placeholder="Ej: Llegó a horario, explicó todo con claridad…"
                placeholderTextColor="rgba(233,254,255,0.6)"
                value={ratingComment}
                onChangeText={setRatingComment}
              />

              <View style={styles.modalButtonsRow}>
                <Pressable
                  style={styles.modalBtnSecondary}
                  onPress={() => setRatingModalVisible(false)}
                  disabled={submittingRating || actionLoading}
                >
                  <Text style={styles.modalBtnSecondaryText}>Más tarde</Text>
                </Pressable>

                <Pressable
                  style={styles.modalBtnPrimary}
                  onPress={submitRating}
                  disabled={submittingRating || actionLoading}
                >
                  {submittingRating ? (
                    <ActivityIndicator color="#06494F" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Enviar</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  title: { color: '#E9FEFF', fontSize: 20, fontWeight: '900' },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },

  avatarCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: '#FFE164',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 35, 40, 0.7)',
  },

  avatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: '#FFE164',
  },

  avatarInitial: { color: '#FFE164', fontWeight: '900', fontSize: 24 },
  clientName: { color: '#E9FEFF', fontWeight: '900', fontSize: 17 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  muted: { color: 'rgba(233,254,255,0.95)', flexShrink: 1 },

  sectionTitle: { color: '#E9FEFF', fontWeight: '800', marginBottom: 4 },
  textBody: { color: 'rgba(233,254,255,0.95)', lineHeight: 20 },

  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { color: '#E9FEFF', fontWeight: '800', fontSize: 16 },

  eventRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  eventType: { color: '#E9FEFF', fontWeight: '700' },
  eventWhen: { color: 'rgba(233,254,255,0.9)' },

  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#002328' },
  badgeOk: { backgroundColor: 'rgba(255, 225, 100, 0.95)' },
  badgeWarn: { backgroundColor: 'rgba(231, 76, 60, 0.9)' },
  badgeSoft: { backgroundColor: 'rgba(233,254,255,0.28)' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  retryBtn: {
    marginTop: 10,
    backgroundColor: '#E9FEFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryText: { color: '#06494F', fontWeight: '800' },

  ctaPrimary: {
    backgroundColor: '#E9FEFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaPrimaryText: { color: '#06494F', fontWeight: '900' },

  ctaAlt: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.55)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaAltText: { color: '#E9FEFF', fontWeight: '800' },

  ctaDanger: {
    backgroundColor: '#FFE5E3',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaDangerText: { color: '#C0392B', fontWeight: '800' },

  ctaDisabled: {
    opacity: 0.55,
  },
  ctaDisabledAlt: {
    opacity: 0.55,
  },

  attachmentImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.6)',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: 'rgba(0, 35, 40, 0.98)',
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    color: '#E9FEFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: 'rgba(233,254,255,0.9)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalStarsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: { padding: 4 },
  modalLabel: {
    color: '#E9FEFF',
    fontWeight: '700',
    marginBottom: 4,
  },
  modalInput: {
    minHeight: 80,
    maxHeight: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.4)',
    padding: 10,
    color: '#E9FEFF',
    textAlignVertical: 'top',
    backgroundColor: 'rgba(0, 35, 40, 0.6)',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  modalBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(233,254,255,0.5)',
  },
  modalBtnSecondaryText: { color: '#E9FEFF', fontWeight: '700' },
  modalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#E9FEFF',
  },
  modalBtnPrimaryText: { color: '#06494F', fontWeight: '800' },

  // 🔍 Preview adjuntos (fullscreen)
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
