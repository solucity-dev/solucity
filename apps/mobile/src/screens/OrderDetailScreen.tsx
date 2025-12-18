// apps/mobile/src/screens/OrderDetailScreen.tsx
import { Ionicons, MaterialCommunityIcons as MDI } from '@expo/vector-icons'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { Image as ExpoImage } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthProvider'
import { api } from '../lib/api'

type OrderEvent = { id: string; type: string; createdAt: string; payload?: any }

type OrderDetail = {
  id: string
  status: string
  description: string | null
  isUrgent: boolean
  preferredAt: string | null
  scheduledAt: string | null
  createdAt: string

  service: {
    id: string
    name: string
    categoryName?: string | null
    categorySlug?: string | null
  } | null

  customer: {
    id: string
    name: string | null
    avatarUrl?: string | null
  } | null

  specialist: {
    id: string
    name: string | null
    avatarUrl?: string | null
  } | null

  address: { id?: string; formatted?: string | null } | string | null
  distanceKm?: number | null

  attachments: any[]
  events: OrderEvent[]
  rating: { score: number; comment: string | null } | null
  chatThreadId?: string | null
}

type Resp = {
  ok: boolean
  order: OrderDetail
  meta?: {
    deadline: 'none' | 'active' | 'expired'
    timeLeftMs: number | null
    deadlineAt: string | null
  }
}

/**
 * ✅ Logger seguro solo en DEV
 */
const devLog = (...args: any[]) => {
  if (__DEV__) console.log(...args)
}

/**
 * ✅ Helper seguro para mostrar errores en Alert
 * Evita: "ReadableNativeMap to String"
 */
function getErrorMessage(e: any) {
  const data = e?.response?.data
  if (!data) return e?.message || 'Error inesperado'
  if (typeof data === 'object' && typeof data.error === 'string') return data.error
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data)
  } catch {
    return 'Error inesperado'
  }
}

/**
 * ✅ Mapeo estado REAL -> sección Agenda
 * (hoy no lo usamos, pero lo dejamos como referencia)
 */
const resolveAgendaSection = (status?: string | null, meta?: Resp['meta']) => {
  if (meta?.deadline === 'expired') return 'CANCELLED'
  if (!status) return 'PENDING'
  if (status === 'PENDING') return 'PENDING'
  if (['ASSIGNED', 'IN_PROGRESS', 'PAUSED'].includes(status)) return 'CONFIRMED'
  if (['FINISHED_BY_SPECIALIST', 'IN_CLIENT_REVIEW', 'CONFIRMED_BY_CLIENT'].includes(status))
    return 'FINISHED'
  if (status.startsWith('CANCELLED') || status === 'CLOSED') return 'CANCELLED'
  return 'PENDING'
}

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<any>()
  const route = useRoute<any>()
  const { mode, user } = useAuth() as any

  const tabBarHeightRaw = useBottomTabBarHeight()
  const tabBarHeight = Math.max(tabBarHeightRaw, 60) // fallback seguro

  const orderId: string | null =
    route.params?.id ?? route.params?.orderId ?? route.params?.item?.id ?? null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<OrderDetail | null>(null)
  const [meta, setMeta] = useState<Resp['meta'] | undefined>(undefined)

  // ⭐ Estado modal de rating
  const [ratingModalVisible, setRatingModalVisible] = useState(false)
  const [ratingScore, setRatingScore] = useState<number>(5)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)

  // ✅ evita race conditions (notificación → navegar rápido / múltiples loads)
  const loadSeqRef = useRef(0)

  // ✅ evita refresh duplicado por focus (react navigation a veces dispara 2 veces)
  const lastFocusReloadRef = useRef<number>(0)

  // ✅ log seguro del params + id resuelto
  useEffect(() => {
    try {
      devLog('[OrderDetail] route.params =', JSON.stringify(route.params ?? {}, null, 2))
    } catch {
      devLog('[OrderDetail] route.params keys =', Object.keys(route.params ?? {}))
    }
    devLog('[OrderDetail] resolved orderId =', orderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const handleBackToAgenda = useCallback(
    (forceStatus?: string | null, forceMeta?: Resp['meta']) => {
      let status = forceStatus ?? data?.status ?? 'PENDING'
      if (forceMeta?.deadline === 'expired') status = 'CANCELLED_AUTO'

      try {
        nav.navigate('AgendaMain', { initialSection: status, refresh: true })
        return true
      } catch {}

      if (nav.canGoBack?.()) {
        nav.goBack()
        return true
      }

      const parent = nav.getParent?.()
      if (parent?.navigate) {
        parent.navigate('Agenda', {
          screen: 'AgendaMain',
          params: { initialSection: status, refresh: true },
        })
        return true
      }

      nav.navigate('Agenda', { initialSection: status, refresh: true })
      return true
    },
    [nav, data?.status]
  )

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => handleBackToAgenda())
      return () => sub.remove()
    }, [handleBackToAgenda])
  )

  const load = async (id: string) => {
    devLog('[OrderDetail][load] start id =', id)

    const seq = ++loadSeqRef.current
    devLog('[OrderDetail][load] seq =', seq)

    try {
      setLoading(true)
      setError(null)

      let url = `/orders/${id}`

      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          url = `/orders/${id}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
        } else {
          devLog('[OrderDetail] ubicación no permitida, se llama sin lat/lng')
        }
      } catch (locErr) {
        devLog('[OrderDetail] error obteniendo ubicación', locErr)
      }

      devLog('[OrderDetail][load] GET =>', url)

      const r = await api.get<Resp>(url, { headers: { 'Cache-Control': 'no-cache' } })

      // ✅ si ya hay otro load posterior, ignoramos este resultado
      if (seq !== loadSeqRef.current) {
        devLog('[OrderDetail][load] ignored result (stale seq)', { seq, current: loadSeqRef.current })
        return null
      }

      // ✅ logs resumidos (evita spam / errores)
      devLog('[OrderDetail][load] response.ok =', r.data?.ok)
      devLog('[OrderDetail][load] order.status =', r.data?.order?.status)
      devLog('[OrderDetail][load] meta.deadline =', r.data?.meta?.deadline)

      // ✅ logs completos (si querés ver todo)
      devLog('[OrderDetail] order from API =', JSON.stringify(r.data.order, null, 2))
      devLog('[OrderDetail] meta from API =', JSON.stringify(r.data.meta, null, 2))

      devLog('[OrderDetail] address raw =', JSON.stringify(r.data.order?.address ?? null, null, 2))

      setData(r.data.order)
      setMeta(r.data.meta)
      return r.data
    } catch (e: any) {
      if (seq !== loadSeqRef.current) return null
      const msg = getErrorMessage(e) ?? 'Error al cargar la orden'
      devLog('[OrderDetail][load] ERROR =', msg)
      setError(msg)
      return null
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }

  // ✅ load inicial cuando cambia el id
  useEffect(() => {
    if (!orderId) {
      setError('Orden sin id (parámetros faltantes desde la navegación)')
      setLoading(false)
      return
    }

    // ✅ reset inmediato para que NO se vea el status anterior (ASSIGNED) al entrar desde notificación
    setData(null)
    setMeta(undefined)
    setError(null)
    setLoading(true)

    devLog('[OrderDetail][effect] initial load for orderId =', orderId)
    load(orderId)
  }, [orderId])

  // ✅ FIX CLAVE: refrescar SIEMPRE al entrar a la pantalla (notificación suele reusar la misma screen)
  useFocusEffect(
    useCallback(() => {
      if (!orderId) return

      const now = Date.now()
      if (now - lastFocusReloadRef.current < 600) return // anti doble-focus
      lastFocusReloadRef.current = now

      // 🔥 para tu caso (notificaciones) es lo más seguro:
      // evitamos ver “Pedido en curso” viejo 1 segundo
      setLoading(true)
      setError(null)
      setData(null)
      setMeta(undefined)

      devLog('[OrderDetail][focus] refresh load for orderId =', orderId)
      load(orderId)
    }, [orderId])
  )

  const fmtDateTime = (iso?: string | null) =>
    !iso
      ? '—'
      : new Date(iso).toLocaleString([], {
          dateStyle: 'short',
          timeStyle: 'short',
        })

  const eventTypeLabel = (type: string) => {
  const t = String(type || '').toUpperCase()
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
  }
  return map[t] ?? type
}

// ✅ rol REAL (no depende de mode)
const isSpecialist = user?.role === 'SPECIALIST'
const isClient = !isSpecialist

  const isExpired = meta?.deadline === 'expired'
  const isPending = data?.status === 'PENDING'
  const isAssignedOrInProgress = data?.status === 'ASSIGNED' || data?.status === 'IN_PROGRESS'
  const inClientReview = data?.status === 'IN_CLIENT_REVIEW'
  const canRate = data?.status === 'CONFIRMED_BY_CLIENT' && !data?.rating

  const isAutoCancelled = data?.status === 'CANCELLED_AUTO'
  const isCancelledByCustomer = data?.status === 'CANCELLED_BY_CUSTOMER'
  const isCancelledBySpecialist = data?.status === 'CANCELLED_BY_SPECIALIST'

  const isCancelled =
    isExpired || !!isAutoCancelled || !!isCancelledByCustomer || !!isCancelledBySpecialist

  const statusTitle =
    isExpired
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
      : data?.status === 'CONFIRMED_BY_CLIENT'
      ? 'Trabajo confirmado'
      : data?.status === 'CLOSED'
      ? 'Pedido cerrado'
      : 'Detalle del pedido'

  // 🔹 Persona que mostramos en el header
  const headerName = isClient
    ? data?.specialist?.name ?? 'Especialista a asignar'
    : data?.customer?.name ?? 'Cliente'

  const headerAvatarUrl = isClient
    ? data?.specialist?.avatarUrl ?? null
    : data?.customer?.avatarUrl ?? null

  const headerInitial = (headerName?.trim?.()[0] ?? 'U').toUpperCase()

  const FILES_BASE_URL = api.defaults.baseURL || process.env.EXPO_PUBLIC_API_URL || ''
  const toAbsoluteUrl = (u?: string | null) => {
    if (!u) return null
    if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('file://')) return u
    const base = FILES_BASE_URL.replace(/\/$/, '')
    const path = u.startsWith('/') ? u : `/${u}`
    return `${base}${path}?t=${Date.now()}`
  }

  const horarioLabel = (() => {
    if (!data) return '—'
    if (data.isUrgent) return 'Lo antes posible'
    if (data.scheduledAt) return fmtDateTime(data.scheduledAt)
    if (data.preferredAt) return fmtDateTime(data.preferredAt)
    return 'Sin definir'
  })()

  const distanceLabel = (() => {
    if (!data) return 'No disponible'
    const d = data.distanceKm
    if (d == null || Number.isNaN(d)) return 'No disponible'
    if (d < 1) return `${Math.round(d * 1000)} m`
    if (d < 10) return `${d.toFixed(1)} km`
    return `${Math.round(d)} km`
  })()

  const deadlinePill = useMemo(() => {
    if (!meta || meta.deadline === 'none') return { text: 'Sin límite', style: styles.badgeSoft }
    if (meta.deadline === 'expired' || !meta.timeLeftMs || meta.timeLeftMs <= 0)
      return { text: 'Límite vencido', style: styles.badgeWarn }

    const totalMinutes = Math.max(0, Math.round(meta.timeLeftMs / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const parts: string[] = []
    if (hours) parts.push(`${hours} h`)
    if (minutes || !hours) parts.push(`${minutes} min`)

    return { text: `Límite: ${parts.join(' ')}`, style: styles.badgeOk }
  }, [meta])

  const attachmentImages: string[] = useMemo(() => {
    if (!data || !Array.isArray(data.attachments)) return []
    return data.attachments
      .map((att: any) => {
        if (!att) return null
        if (typeof att === 'string') return toAbsoluteUrl(att)
        if (typeof att.uri === 'string') return toAbsoluteUrl(att.uri)
        if (typeof att.url === 'string') return toAbsoluteUrl(att.url)
        if (typeof att.fileUrl === 'string') return toAbsoluteUrl(att.fileUrl)
        return null
      })
      .filter((u): u is string => typeof u === 'string')
  }, [data])

  const addressText = (() => {
  const a: any = data?.address
  if (!a) return '—'

  // 1) string plano
  if (typeof a === 'string') return a.trim() || '—'

  // 2) tu formato esperado actual
  if (typeof a.formatted === 'string' && a.formatted.trim()) return a.formatted.trim()

  // 3) otros formatos comunes (por si el backend cambia en ASSIGNED)
  const candidates = [
    a.address,
    a.full,
    a.text,
    a.label,
    a.display,
    a.formattedAddress,
    a.line1,
  ].filter((x) => typeof x === 'string' && x.trim())

  if (candidates.length) return candidates[0].trim()

  // 4) si viene en partes (street/number/city)
  const parts = [a.street, a.number, a.city, a.state, a.zip]
    .filter((x) => typeof x === 'string' && x.trim())
    .map((s: string) => s.trim())

  if (parts.length) return parts.join(' ')

  // 5) fallback para debug en DEV
  try {
    return __DEV__ ? JSON.stringify(a) : '—'
  } catch {
    return '—'
  }
})()

  // ✅ Chat disponible por estado (no por chatThreadId; si falta, reintentamos en el tap)
  const canShowChat = !isPending && !isCancelled

  const confirmCancel = (onConfirm: () => void) => {
    Alert.alert(
      '¿Cancelar solicitud?',
      'Esta acción cancelará la orden. ¿Seguro que querés continuar?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: onConfirm },
      ]
    )
  }

  // ───────────────────── acciones ─────────────────────
  const doAccept = async () => {
    if (!data) return
    try {
      await api.post(`/orders/${data.id}/accept`, {})
      Alert.alert('Listo', 'Pedido aceptado')
      const fresh = orderId ? await load(orderId) : null
      handleBackToAgenda(fresh?.order?.status ?? 'ASSIGNED', fresh?.meta)
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo aceptar')
    }
  }

  const doCancelBySpecialist = async () => {
  if (!data) return
  try {
    await api.post(`/orders/${data.id}/cancel-by-specialist`, {
      reason: 'Rechazado por el especialista',
    })
    Alert.alert('Listo', 'Solicitud rechazada')
    const fresh = orderId ? await load(orderId) : null
    handleBackToAgenda(fresh?.order?.status ?? 'CANCELLED_BY_SPECIALIST', fresh?.meta)
  } catch (e: any) {
    Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo rechazar')
  }
}


  const doCancelAsCustomer = async () => {
    if (!data) return
    try {
      await api.post(`/orders/${data.id}/cancel`, {
        reason: 'Cancelado por el cliente desde OrderDetail',
      })
      Alert.alert('Listo', 'Solicitud cancelada')
      const fresh = orderId ? await load(orderId) : null
      handleBackToAgenda(fresh?.order?.status ?? 'CANCELLED_BY_CUSTOMER', fresh?.meta)
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo cancelar la solicitud')
    }
  }

  const doCancelAsSpecialist = async () => {
    if (!data) return
    try {
      await api.post(`/orders/${data.id}/cancel-by-specialist`, {
        reason: 'Cancelado por el especialista desde OrderDetail',
      })
      Alert.alert('Listo', 'Solicitud cancelada')
      const fresh = orderId ? await load(orderId) : null
      handleBackToAgenda(fresh?.order?.status ?? 'CANCELLED_BY_SPECIALIST', fresh?.meta)
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo cancelar')
    }
  }

  const doFinish = async () => {
    if (!data) return
    try {
      await api.post(`/orders/${data.id}/finish`, { attachments: [], note: null })
      Alert.alert('Listo', 'Trabajo marcado como finalizado')
      const fresh = orderId ? await load(orderId) : null
      handleBackToAgenda(fresh?.order?.status ?? 'IN_CLIENT_REVIEW', fresh?.meta)
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo finalizar')
    }
  }

  const doRejectFinishAsCustomer = async () => {
  if (!data) return
  try {
    await api.post(`/orders/${data.id}/reject`, {
      reason: 'El cliente rechazó la finalización',
    })
    Alert.alert('Listo', 'Se rechazó la finalización. El trabajo volvió a estar en curso.')

    const fresh = orderId ? await load(orderId) : null
    handleBackToAgenda(fresh?.order?.status ?? 'IN_PROGRESS', fresh?.meta)
  } catch (e: any) {
    Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo rechazar la finalización')
  }
}

  const openRatingModal = () => {
    setRatingScore(5)
    setRatingComment('')
    setRatingModalVisible(true)
  }

  const doConfirm = async () => {
    if (!data) return
    try {
      await api.post(`/orders/${data.id}/confirm`, {})
      Alert.alert('Listo', 'Trabajo confirmado')
      const fresh = orderId ? await load(orderId) : null
      if (!fresh?.order?.rating) openRatingModal()
      else handleBackToAgenda(fresh?.order?.status ?? 'CONFIRMED_BY_CLIENT', fresh?.meta)
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo confirmar')
    }
  }

  const submitRating = async () => {
    if (!data) return
    try {
      setSubmittingRating(true)
      await api.post(`/orders/${data.id}/rate`, {
        score: ratingScore,
        comment: ratingComment.trim() || null,
      })
      setRatingModalVisible(false)
      Alert.alert('Gracias', 'Calificación enviada')
      const fresh = orderId ? await load(orderId) : null
      handleBackToAgenda(fresh?.order?.status ?? 'CLOSED', fresh?.meta)
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e) ?? 'No se pudo calificar')
    } finally {
      setSubmittingRating(false)
    }
  }

  const handleOpenChat = async () => {
    if (!data || !canShowChat) return

    let threadId = data.chatThreadId ?? null
    if (!threadId) {
      const fresh = orderId ? await load(orderId) : null
      threadId = fresh?.order?.chatThreadId ?? null
    }

    if (!threadId) {
      Alert.alert(
        'Chat no disponible',
        'Todavía no se creó el chat para esta orden. Probá de nuevo en unos segundos.'
      )
      return
    }

    const parent = nav.getParent?.()
    const title =
  isSpecialist
    ? data.customer?.name ?? data.service?.name ?? 'Chat'
    : data.specialist?.name ?? data.service?.name ?? 'Chat'

    const params = { threadId, orderId: data.id, title }

    if (parent?.navigate) {
      parent.navigate('Chat', { screen: 'ChatThread', params })
      return
    }

    nav.navigate('ChatThread', params)
  }

  // ───────────────────── UI states ─────────────────────
  const showPendingSpecialistActions = isPending && !isCancelled && isSpecialist
  const showPendingCustomerActions = isPending && !isCancelled && isClient
  const showSpecialistProgressActions = isAssignedOrInProgress && !isCancelled && isSpecialist
  const showClientReviewActions = inClientReview && !isCancelled && isClient
  const showConfirmedActions = isAssignedOrInProgress && !isCancelled

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
    )
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
    )
  }

  const rubroLabel = data.service?.categoryName ?? data.service?.name ?? 'Sin datos'

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
              {headerAvatarUrl ? (
                <ExpoImage
                  source={toAbsoluteUrl(headerAvatarUrl) ?? ''}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{headerInitial}</Text>
                </View>
              )}
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.clientName}>{headerName}</Text>
              </View>
            </View>

            <View style={{ height: 10 }} />

            <View style={styles.row}>
              <Ionicons name="location-outline" size={18} color="#E9FEFF" />
              <Text style={styles.muted}>Distancia: {distanceLabel}</Text>
            </View>

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

            <View style={styles.row}>
              <Ionicons name="home-outline" size={18} color="#E9FEFF" />
              <Text style={styles.muted}>Dirección: {addressText}</Text>
            </View>

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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {attachmentImages.map((uri, idx) => (
                    <ExpoImage
                      key={`${uri}-${idx}`}
                      source={uri}
                      style={styles.attachmentImage}
                      contentFit="cover"
                      transition={150}
                    />
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
            {/* ✅ RESEÑA (aparece SOLO si existe data.rating) */}
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

          <View style={{ gap: 10 }}>
            {showPendingSpecialistActions && (
              <>
                <Pressable style={styles.ctaPrimary} onPress={doAccept}>
                  <Text style={styles.ctaPrimaryText}>Aceptar pedido</Text>
                </Pressable>
                <Pressable style={styles.ctaDanger} onPress={() => confirmCancel(doCancelBySpecialist)}>
                  <Text style={styles.ctaDangerText}>Rechazar solicitud</Text>
                </Pressable>
              </>
            )}

            {showPendingCustomerActions && (
              <Pressable style={styles.ctaDanger} onPress={() => confirmCancel(doCancelAsCustomer)}>
                <Text style={styles.ctaDangerText}>Cancelar solicitud</Text>
              </Pressable>
            )}

            {showConfirmedActions && (
              <>
                {isClient ? (
                  <Pressable style={styles.ctaDanger} onPress={() => confirmCancel(doCancelAsCustomer)}>
                    <Text style={styles.ctaDangerText}>Cancelar solicitud</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.ctaDanger}
                    onPress={() => confirmCancel(doCancelAsSpecialist)}
                  >
                    <Text style={styles.ctaDangerText}>Cancelar solicitud</Text>
                  </Pressable>
                )}

                <Pressable style={styles.ctaAlt} onPress={handleOpenChat}>
                  <Text style={styles.ctaAltText}>Ir al chat</Text>
                </Pressable>
              </>
            )}

            {showSpecialistProgressActions && (
              <Pressable style={styles.ctaPrimary} onPress={doFinish}>
                <Text style={styles.ctaPrimaryText}>Marcar como finalizado</Text>
              </Pressable>
            )}

            {showClientReviewActions && (
  <>
    <Pressable style={styles.ctaPrimary} onPress={doConfirm}>
      <Text style={styles.ctaPrimaryText}>Confirmar trabajo</Text>
    </Pressable>

    <Pressable
      style={styles.ctaAlt}
      onPress={() => confirmCancel(doRejectFinishAsCustomer)}
    >
      <Text style={styles.ctaAltText}>Rechazar finalización</Text>
    </Pressable>
  </>
)}


            {canRate && (
              <Pressable style={styles.ctaPrimary} onPress={openRatingModal}>
                <Text style={styles.ctaPrimaryText}>Calificar y cerrar</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

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
                  <Pressable key={val} style={styles.starButton} onPress={() => setRatingScore(val)}>
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
                  disabled={submittingRating}
                >
                  <Text style={styles.modalBtnSecondaryText}>Más tarde</Text>
                </Pressable>

                <Pressable
                  style={styles.modalBtnPrimary}
                  onPress={submitRating}
                  disabled={submittingRating}
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
  )
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
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#FFE164',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 35, 40, 0.7)',
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#FFE164',
  },
  avatarInitial: { color: '#FFE164', fontWeight: '900', fontSize: 18 },
  clientName: { color: '#E9FEFF', fontWeight: '800', fontSize: 16 },

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
})



































