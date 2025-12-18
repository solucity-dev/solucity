// apps/mobile/src/screens/SpecialistHome.tsx
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAuth } from '../auth/AuthProvider'
import { api } from '../lib/api'

import {
  listCertifications,
  uploadCertificationFile,
  upsertCertification,
  type CertItem,
} from '../lib/specialistsApi'

// info de suscripción
import { getMySubscription, type SubscriptionInfo } from '../lib/subscriptionApi'

// tipos de navegación del stack Home del especialista
import type { SpecialistHomeStackParamList } from '../types'

// 🔔 contador global de notificaciones
import { useNotifications } from '../notifications/NotificationsProvider'

type SpecProfile = {
  bio: string
  available: boolean
  radiusKm: number | null
  visitPrice: number | null
  availability: { days: number[]; start: string; end: string; enabled?: boolean }
  ratingAvg: number | null
  ratingCount: number | null
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | null
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'
  specialties: string[]
  avatarUrl?: string | null
  name?: string | null
  centerLat?: number | null
  centerLng?: number | null
  stats?: {
    done: number
    canceled: number
  }
}

type ReviewItem = {
  id: string
  createdAt: string
  score: number
  comment: string | null
  serviceName: string
  customerName: string
}

function absoluteUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('/')) return `${api.defaults.baseURL?.replace(/\/+$/, '')}${u}`
  return u
}

const SPECIALTY_OPTIONS = [
  'albañileria',
  'electricidad',
  'yeseria/durlock',
  'carpinteria',
  'herreria',
  'plomeria',
  'pintura',
  'jardineria',
  'piscinas',
  'climatizacion',
  'servicio tecnico (electronica)',
  'servicio tecnico (electrodomesticos)',
  'servicio tecnico (informatica)',
  'cerrajeria',
  'camaras y alarmas',
  'personal de seguridad',
  'limpieza',
  'clases particulares',
  'paseador de perros',
  'acompañante terapeutico',
  'fletes',
] as const

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.sectionHdr} onPress={onToggle}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#E9FEFF" />
      </Pressable>
      {open ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </View>
  )
}

export default function SpecialistHome() {
  const insets = useSafeAreaInsets()

  // navegación dentro del SpecialistHomeStack (Home + Notifications)
  const navigation =
    useNavigation<NativeStackNavigationProp<SpecialistHomeStackParamList>>()

  // 🔔 contador global
  const { unread } = useNotifications()

  // auth (usamos any para no pelear con tipos viejos)
  const auth = useAuth() as any
  const token: string | null = auth.token ?? null
  const logout: (() => void) | undefined = auth.logout

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<SpecProfile | null>(null)
  const [locationRequested, setLocationRequested] = useState(false)

  // form fields
  const [bio, setBio] = useState('')
  const [available, setAvailable] = useState(true)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [specialties, setSpecialties] = useState<string[]>([])

  // tarifa y radio
  const [price, setPrice] = useState<string>('0')
  const [radius, setRadius] = useState<string>('10')

  // suscripción
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)

  // avatar
  const [avatar, setAvatar] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [localUri, setLocalUri] = useState<string | null>(null)

  // certificaciones
  const [certs, setCerts] = useState<CertItem[]>([])
  const [certSaving, setCertSaving] = useState(false)
  const [openCerts, setOpenCerts] = useState(true)

  // ⭐ reseñas del especialista
  const [reviews, setReviews] = useState<ReviewItem[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await api.get('/specialists/me')
        if (!data?.ok) throw new Error('bad_response')
        const p: SpecProfile = data.profile
        setProfile(p)
        setBio(p.bio ?? '')
        setAvailable(!!p.available)

        const avail = p.availability ?? {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '18:00',
        }
        setDays(avail.days ?? [1, 2, 3, 4, 5])
        setStart(avail.start ?? '09:00')
        setEnd(avail.end ?? '18:00')

        setSpecialties(p.specialties ?? [])
        setAvatar(p.avatarUrl ?? null)

        // init tarifa/radio
        setPrice(String(p.visitPrice ?? 0))
        setRadius(String(p.radiusKm ?? 10))

        // cargar certificaciones existentes
        try {
          const items = await listCertifications()
          setCerts(items)
        } catch {}

        // cargar info de suscripción
        try {
          const sub = await getMySubscription()
          setSubscription(sub)
        } catch (e) {
          if (__DEV__) console.log('[Subscription] error al cargar', e)
        }
      } catch (err: any) {
        const status = err?.response?.status
        if (status === 401) {
          if (__DEV__) console.log('[SpecialistHome] 401 en /specialists/me, forzando logout')
          Alert.alert('Sesión expirada', 'Volvé a iniciar sesión para continuar.', [
            {
              text: 'OK',
              onPress: () => {
                try {
                  logout?.()
                } catch {}
              },
            },
          ])
        } else {
          Alert.alert('Ups', 'No se pudo cargar tu perfil')
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [token, logout])

  // Cargar TODAS las reseñas desde /orders/mine (role = specialist, status = closed)
  useEffect(() => {
    if (!token) return

    ;(async () => {
      try {
        const { data } = await api.get('/orders/mine', {
          params: { role: 'specialist', status: 'closed' },
        })

        if (!data?.ok || !Array.isArray(data.orders)) return

        const rated = data.orders.filter((o: any) => o.rating?.score)

        rated.sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )

        const mapped: ReviewItem[] = rated.map((o: any) => ({
          id: o.id,
          createdAt: o.createdAt,
          score: o.rating.score,
          comment: o.rating.comment ?? null,
          serviceName: o.service?.name ?? 'Servicio',
          customerName: o.customer?.name ?? 'Cliente',
        }))

        setReviews(mapped)
      } catch (e) {
        if (__DEV__) console.log('[SpecialistHome] error cargando reseñas', e)
      }
    })()
  }, [token])

  // Pedir ubicación si el especialista todavía no tiene centerLat/centerLng
  // o si están en (0,0) que es nuestro "valor basura" inicial
  useEffect(() => {
    if (!profile) return
    if (locationRequested) return

    const hasCoords =
      profile.centerLat != null &&
      profile.centerLng != null &&
      !(profile.centerLat === 0 && profile.centerLng === 0)

    // Si ya tiene coords válidas, no pedimos nada
    if (hasCoords) return

    // Si NO tiene coords o están en (0,0), pedimos ubicación
    setLocationRequested(true)
    updateLocationFromDevice({ silent: true })
  }, [profile, locationRequested])

  const avatarSrc = useMemo(() => {
    const u = absoluteUrl(avatar)
    return u ? { uri: u } : require('../assets/avatar-placeholder.png')
  }, [avatar])

  const statsDone = profile?.stats?.done ?? 0
  const statsCanceled = profile?.stats?.canceled ?? 0


  // permisos para cámara / galería
  async function requestCamera() {
    const cam = await ImagePicker.requestCameraPermissionsAsync()
    if (cam.status !== 'granted') {
      Alert.alert('Permisos', 'Necesitamos permiso de cámara para sacar tu foto.')
      return false
    }
    return true
  }
  async function requestMedia() {
    const med = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (med.status !== 'granted') {
      Alert.alert('Permisos', 'Necesitamos permiso para acceder a tus fotos.')
      return false
    }
    return true
  }

  // avatar
  async function openCamera() {
    if (!(await requestCamera())) return
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (!res.canceled && res.assets?.[0]?.uri) {
      setLocalUri(res.assets[0].uri)
      setPickerOpen(false)
      setPreviewOpen(true)
    }
  }
  async function openGallery() {
    if (!(await requestMedia())) return
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (!res.canceled && res.assets?.[0]?.uri) {
      setLocalUri(res.assets[0].uri)
      setPickerOpen(false)
      setPreviewOpen(true)
    }
  }
  async function confirmAvatar() {
    if (!localUri) return
    try {
      setSaving(true)
      const manipulated = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      )

      const form = new FormData()
      form.append('file', {
        uri: manipulated.uri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any)

      const up = await api.post('/specialists/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const urlRel: string | undefined = up?.data?.url
      if (!urlRel) throw new Error('upload_failed')

      await api.patch('/specialists/me', { avatarUrl: urlRel })
      setAvatar(urlRel)
      setPreviewOpen(false)
      setLocalUri(null)
    } catch (e: any) {
      const msg =
        e?.response?.data?.error === 'low_quality'
          ? 'La imagen es muy chica. Probá con otra más nítida o con mejor luz.'
          : 'No se pudo actualizar tu foto de perfil.'
      Alert.alert('Ups', msg)
    } finally {
      setSaving(false)
    }
  }

  // saves
  async function saveBio() {
    try {
      setSaving(true)
      await api.patch('/specialists/me', { bio })
      Alert.alert('Listo', 'Biografía actualizada.')
    } catch {
      Alert.alert('Ups', 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailable(v: boolean) {
    try {
      setAvailable(v)
      await api.patch('/specialists/me', { available: v })
    } catch {
      setAvailable((prev) => !prev)
      Alert.alert('Ups', 'No se pudo actualizar el estado.')
    }
  }

  async function saveAvailability() {
    try {
      setSaving(true)
      await api.patch('/specialists/me', {
        availability: { days, start, end },
        available,
      })
      Alert.alert('Listo', 'Disponibilidad actualizada.')
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la disponibilidad.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSpecialties() {
    try {
      setSaving(true)
      await api.patch('/specialists/specialties', { specialties })
      Alert.alert('Listo', 'Rubros actualizados.')
    } catch {
      Alert.alert('Ups', 'No se pudieron actualizar los rubros.')
    } finally {
      setSaving(false)
    }
  }

  async function savePriceAndRadius() {
    try {
      setSaving(true)
      const visitPrice = Math.max(0, Math.floor(Number(price) || 0))
      const radiusKm = Math.max(0, Number(radius) || 0)
      await api.patch('/specialists/me', { visitPrice, radiusKm })
      Alert.alert('Listo', 'Tarifa y radio actualizados.')
    } catch {
      Alert.alert('Ups', 'No se pudo guardar la tarifa/radio.')
    } finally {
      setSaving(false)
    }
  }

  // Ubicación: pedir permisos, obtener coords y guardarlas en el backend
  async function updateLocationFromDevice(options?: { silent?: boolean }) {
    const silent = options?.silent ?? true
    try {
      setSaving(true)

      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        if (!silent) {
          Alert.alert(
            'Permiso requerido',
            'Necesitamos acceder a tu ubicación para mostrarte en las búsquedas cercanas.',
          )
        }
        return
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      const lat = pos.coords.latitude
      const lng = pos.coords.longitude

      await api.patch('/specialists/me', {
        centerLat: lat,
        centerLng: lng,
      })

      // 👇 Actualizamos el estado local para que no vuelva a pedir ubicación
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              centerLat: lat,
              centerLng: lng,
            }
          : prev,
      )

      if (!silent) {
        Alert.alert('Listo', 'Actualizamos tu ubicación para las búsquedas cercanas.')
      }
    } catch (e) {
      if (__DEV__) console.log('[updateLocationFromDevice] error', e)
      if (!silent) {
        Alert.alert('Ups', 'No pudimos actualizar tu ubicación. Probá de nuevo más tarde.')
      }
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort(),
    )
  }
  function toggleSpecialty(slug: string) {
    setSpecialties((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  }

  function renderSubscriptionMainText(sub: SubscriptionInfo) {
    if (sub.status === 'TRIALING') {
      if (typeof sub.daysRemaining === 'number') {
        if (sub.daysRemaining <= 0) {
          return 'Tu prueba termina hoy. Pronto vas a poder activar tu plan mensual desde aquí.'
        }
        if (sub.daysRemaining === 1) {
          return 'Te queda 1 día de prueba gratuita como especialista.'
        }
        return `Te quedan ${sub.daysRemaining} días de prueba gratuita como especialista.`
      }
      return 'Tenés una prueba gratuita activa como especialista.'
    }
    if (sub.status === 'ACTIVE') {
      return 'Tu suscripción está activa. Seguís apareciendo en las búsquedas y podés recibir nuevos trabajos.'
    }
    if (sub.status === 'PAST_DUE') {
      return 'Tu suscripción tiene un pago pendiente. Pronto vas a poder regularizarla desde la app.'
    }
    return 'Tu suscripción está inactiva. Cuando lancemos los pagos vas a poder reactivarla desde aquí.'
  }

  function certStatusBadge(status?: CertItem['status']) {
    switch (status) {
      case 'APPROVED':
        return { bg: 'rgba(0,160,120,0.18)', txt: '#8EF0CF', label: 'Aprobada' }
      case 'REJECTED':
        return { bg: 'rgba(240,50,60,0.18)', txt: '#FFC7CD', label: 'Rechazada' }
      default:
        return { bg: 'rgba(240,200,60,0.18)', txt: '#FFE8A3', label: 'Pendiente' }
    }
  }
  function findCert(slug: string) {
    return certs.find((c) => c.category.slug === slug)
  }
  async function handleUploadCert(categorySlug: string) {
    try {
      setCertSaving(true)
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: true,
        aspect: [4, 3],
      })
      if (res.canceled || !res.assets?.[0]?.uri) return

      const relativeUrl = await uploadCertificationFile(res.assets[0].uri)
      await upsertCertification({ categorySlug, fileUrl: relativeUrl })

      const items = await listCertifications()
      setCerts(items)
      Alert.alert('Listo', 'Matrícula subida y enviada a revisión.')
    } catch {
      Alert.alert('Ups', 'No se pudo subir la matrícula.')
    } finally {
      setCertSaving(false)
    }
  }

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} />
      </LinearGradient>
    )
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
            <Text style={styles.brandText}>solucity</Text>
          </View>
          <Pressable
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={26} color="#E9FEFF" />
            {unread > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
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

              {/* ⭐ Rating arriba con promedio real y cantidad */}
              <View style={styles.starsRow}>
                {(() => {
                  const avg =
                    profile?.ratingAvg != null && !Number.isNaN(profile.ratingAvg)
                      ? profile.ratingAvg
                      : reviews.length
                      ? reviews.reduce((acc, r) => acc + r.score, 0) / reviews.length
                      : 0

                  const count =
                    profile?.ratingCount != null ? profile.ratingCount : reviews.length

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
                  )
                })()}
              </View>

              <Text style={[styles.muted, { marginTop: 2 }]}>
                KYC: {profile?.kycStatus}
              </Text>
            </View>
          </View>

          {/* Tarjeta de suscripción / trial */}
          {subscription ? (
            <View style={[styles.card, styles.subCard]}>
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
                  name={
                    subscription.status === 'ACTIVE'
                      ? 'checkmark-circle'
                      : 'time-outline'
                  }
                  size={20}
                  color="#E9FEFF"
                />
              </View>

              <Text style={styles.subMainText}>
                {renderSubscriptionMainText(subscription)}
              </Text>

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
            </View>
          ) : null}

          {/* Estado */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Estado</Text>
              <View
                style={[
                  styles.badge,
                  available ? styles.badgeOn : styles.badgeOff,
                ]}
              >
                <View
                  style={[styles.dot, available ? styles.dotOn : styles.dotOff]}
                />
                <Text
                  style={[
                    styles.badgeT,
                    { color: available ? '#063A40' : '#6F8C90' },
                  ]}
                >
                  {available ? 'Disponible' : 'No disponible'}
                </Text>
              </View>
            </View>
            <View style={styles.stateRow}>
              <Text style={styles.label}>Habilitar disponibilidad</Text>
              <Switch value={available} onValueChange={toggleAvailable} />
            </View>
          </View>

                  {/* Contrataciones: realizados / cancelados */}
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
              style={[styles.btn, saving && styles.btnDisabled]}
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
                const on = days.includes(idx)
                return (
                  <Pressable
                    key={d}
                    onPress={() => toggleDay(idx)}
                    style={[
                      styles.dayChip,
                      on ? styles.dayOn : styles.dayOff,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayT,
                        { color: on ? '#063A40' : '#9ec9cd' },
                      ]}
                    >
                      {d}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={[styles.subTitle, { marginTop: 10 }]}>Horario</Text>
            <View style={styles.timeRow}>
              <TextInput
                value={start}
                onChangeText={setStart}
                keyboardType="numbers-and-punctuation"
                placeholder="09:00"
                placeholderTextColor="#9ec9cd"
                style={[styles.input, styles.timeInput]}
              />
              <Text style={[styles.muted, { marginHorizontal: 6 }]}>a</Text>
              <TextInput
                value={end}
                onChangeText={setEnd}
                keyboardType="numbers-and-punctuation"
                placeholder="18:00"
                placeholderTextColor="#9ec9cd"
                style={[styles.input, styles.timeInput]}
              />
            </View>

            <Pressable
              onPress={saveAvailability}
              style={[styles.btn, saving && styles.btnDisabled]}
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
            <Text style={styles.muted}>
              Usalo como precio por visita, por hora, etc. según tu rubro.
            </Text>

            <Text style={[styles.subTitle, { marginTop: 10 }]}>
              Radio de trabajo (km)
            </Text>
            <TextInput
              value={radius}
              onChangeText={setRadius}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor="#9ec9cd"
              style={styles.input}
            />
            <Text style={styles.muted}>
              Distancia máxima desde tu zona de cobertura.
            </Text>

            <Pressable
              onPress={savePriceAndRadius}
              style={[styles.btn, saving && styles.btnDisabled]}
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
              <Text style={[styles.btnT, { color: '#E9FEFF' }]}>
                Usar mi ubicación actual
              </Text>
            </Pressable>
          </View>

          {/* Rubros */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Rubros</Text>
              <Text style={styles.muted}>{specialties.length} seleccionados</Text>
            </View>

            <View style={styles.chipsWrap}>
              {SPECIALTY_OPTIONS.map((slug) => {
                const on = specialties.includes(slug)
                return (
                  <Pressable
                    key={slug}
                    onPress={() => toggleSpecialty(slug)}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  >
                    <Text
                      style={[
                        styles.chipT,
                        { color: on ? '#063A40' : '#9ec9cd' },
                      ]}
                    >
                      {slug}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Pressable
              onPress={saveSpecialties}
              style={[styles.btn, saving && styles.btnDisabled]}
            >
              <Text style={styles.btnT}>Guardar rubros</Text>
            </Pressable>
          </View>

          {/* Matrículas por rubro */}
          <Section
            title="Matrículas por rubro"
            open={openCerts}
            onToggle={() => setOpenCerts((v) => !v)}
          >
            {specialties.length ? (
              <View style={{ gap: 10 }}>
                {specialties.map((slug) => {
                  const c = findCert(slug)
                  const badge = certStatusBadge(c?.status)
                  return (
                    <View key={slug} style={styles.certItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>{slug}</Text>
                        {c?.fileUrl ? (
                          <Text style={styles.muted} numberOfLines={1}>
                            {c.number ? `# ${c.number} · ` : ''}
                            {c.issuer ? `${c.issuer} · ` : ''}
                            {c.fileUrl}
                          </Text>
                        ) : (
                          <Text style={styles.muted}>
                            Sin archivo subido
                          </Text>
                        )}
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: badge.bg },
                          ]}
                        >
                          <Text
                            style={[styles.badgeT, { color: badge.txt }]}
                          >
                            {badge.label}
                          </Text>
                        </View>
                        <Pressable
                          style={[
                            styles.smallBtn,
                            certSaving && { opacity: 0.6 },
                          ]}
                          onPress={() => handleUploadCert(slug)}
                          disabled={certSaving}
                        >
                          <Text style={styles.smallBtnT}>
                            {c ? 'Actualizar' : 'Subir'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <Text style={styles.muted}>
                Elegí al menos un rubro arriba para cargar su matrícula.
              </Text>
            )}
          </Section>

          {/* Reseñas */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reseñas</Text>

            {reviews.length === 0 ? (
              <Text style={styles.muted}>Aún no tenés reseñas.</Text>
            ) : (
              <View style={{ marginTop: 8, gap: 10 }}>
                {reviews.map((r) => (
                  <View key={r.id} style={styles.reviewItem}>
                    <View style={styles.reviewHeaderRow}>
                      {/* Estrellas + puntaje */}
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
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

                      {/* Cliente + fecha */}
                      <Text
                        style={styles.reviewMeta}
                        numberOfLines={1}
                      >
                        {r.customerName} · {formatDate(r.createdAt)}
                      </Text>
                    </View>

                    {/* Comentario */}
                    {r.comment ? (
                      <Text style={styles.reviewComment} numberOfLines={3}>
                        “{r.comment}”
                      </Text>
                    ) : (
                      <Text style={styles.reviewComment}>
                        El cliente calificó con {r.score.toFixed(1)} estrellas.
                      </Text>
                    )}

                    {/* Servicio */}
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
            {localUri ? (
              <Image source={{ uri: localUri }} style={styles.previewImg} />
            ) : null}
            <View style={styles.previewRow}>
              <Pressable
                style={[
                  styles.btn,
                  { flex: 1, backgroundColor: 'rgba(10,91,99,0.12)' },
                ]}
                onPress={() => {
                  setPreviewOpen(false)
                  setLocalUri(null)
                }}
              >
                <Text style={[styles.btnT, { color: '#0A5B63' }]}>
                  Cancelar
                </Text>
              </Pressable>
              <View style={{ width: 10 }} />
              <Pressable
                style={[styles.btn, { flex: 1 }]}
                disabled={saving}
                onPress={confirmAvatar}
              >
                <Text style={styles.btnT}>
                  {saving ? 'Subiendo…' : 'Usar foto'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  )
}

const AVATAR = 118

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
    padding: 4,
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
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

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

  // Tarjeta de suscripción
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
  subPillText: {
    color: '#E9FEFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  subMainText: {
    color: '#E9FEFF',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  subSecondaryText: {
    color: '#B5DADD',
    fontSize: 13,
    marginTop: 4,
  },
  subDaysHighlight: {
    fontWeight: '800',
    color: '#FFE29B',
  },

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
  timeInput: { flex: 1, textAlign: 'center' },

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

  sectionHdr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

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

  // 📊 Stats de contrataciones
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,45,52,0.9)',
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    color: '#E9FEFF',
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    color: '#B9E2E5',
    fontSize: 13,
  },

  // ⭐ estilos de reseñas
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
  reviewMeta: {
    color: '#9ec9cd',
    fontSize: 11,
    marginLeft: 8,
    flexShrink: 1,
    textAlign: 'right',
  },
  reviewComment: {
    color: '#E9FEFF',
    fontSize: 13,
    marginTop: 2,
  },
  reviewService: {
    color: '#9ec9cd',
    fontSize: 11,
    marginTop: 4,
  },
})


























