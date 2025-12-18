// apps/mobile/src/notifications/NotificationsProvider.tsx
import * as Notifications from 'expo-notifications'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Platform } from 'react-native'

import { useAuth } from '../auth/AuthProvider'
import { api } from '../lib/api'

// ✅ Registro push (permisos + channel + token)
import { registerForPush } from './registerForPush'

// ✅ navegación global (ref)
import { navigateToChatThread, navigateToOrderDetail } from '../navigation/navigationRef'

type NotificationsContextValue = {
  unread: number
  refreshing: boolean
  refresh: () => Promise<void>
  expoPushToken: string | null
}

const NotificationsContext =
  createContext<NotificationsContextValue | undefined>(undefined)

/**
 * ✅ Extrae orderId/threadId/notificationDbId/type de cualquier payload común
 * OJO: resp.notification.request.identifier NO es el id de tu DB.
 */
function extractDataFromResponse(resp: Notifications.NotificationResponse | null) {
  const content = resp?.notification?.request?.content
  const data: any = content?.data ?? {}

  const orderId =
    data?.orderId ??
    data?.order_id ??
    data?.order?.id ??
    data?.payload?.orderId ??
    data?.payload?.order_id ??
    data?.data?.orderId ??
    data?.data?.order_id ??
    null

  const threadId =
    data?.threadId ??
    data?.thread_id ??
    data?.chatThreadId ??
    data?.chat_thread_id ??
    data?.order?.chatThreadId ??
    data?.order?.chat_thread_id ??
    data?.payload?.threadId ??
    data?.payload?.thread_id ??
    data?.data?.threadId ??
    data?.data?.thread_id ??
    null

  // ✅ IMPORTANTÍSIMO: si el backend manda id real de notificación, lo usamos
  const notificationDbId =
    data?.notificationId ??
    data?.notification_id ??
    data?.notifId ??
    data?.notif_id ??
    data?.id ??
    data?.data?.notificationId ??
    data?.payload?.notificationId ??
    null

  const type =
    data?.type ??
    data?.notificationType ??
    data?.eventType ??
    null

  return { data, orderId, threadId, type, notificationDbId }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token, ready, user } = useAuth()
  const [unread, setUnread] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)

  // ✅ evita requests en paralelo
  const inFlightRef = useRef(false)

  // ✅ evita navegar 2 veces por la misma notificación (cold start + listener)
  const lastHandledNotificationIdRef = useRef<string | null>(null)

  const refresh = async () => {
    if (!token) {
      setUnread(0)
      try {
        await Notifications.setBadgeCountAsync(0)
      } catch {}
      return
    }
    if (inFlightRef.current) return

    inFlightRef.current = true
    setRefreshing(true)

    try {
      const { data } = await api.get('/notifications', {
        params: { limit: 50 },
        headers: { 'Cache-Control': 'no-cache' },
      })

      const items = Array.isArray(data?.items) ? data.items : []
      const count = items.filter((n: any) => !n.readAt).length
      setUnread(count)

      try {
        await Notifications.setBadgeCountAsync(count)
      } catch {}
    } catch (e: any) {
      const status = e?.response?.status
      const code = e?.code

      if (code === 'ERR_NETWORK') {
        if (__DEV__) console.log('[NotificationsProvider] network error (ignored)')
        return
      }

      if (status === 401) {
        setUnread(0)
        try {
          await Notifications.setBadgeCountAsync(0)
        } catch {}
        return
      }

      if (__DEV__) console.log('[NotificationsProvider] error', status, e?.message)
    } finally {
      inFlightRef.current = false
      setRefreshing(false)
    }
  }

  /**
   * ✅ Marca como leída en backend (si podemos)
   */
  const markTappedNotificationAsRead = async (args: {
    notificationDbId: string | null
    orderId: string | null
    type: string | null
  }) => {
    if (!ready || !token) return

    const { notificationDbId, orderId, type } = args

    // 1) Si el payload trae id real -> directo
    if (notificationDbId) {
      try {
        await api.patch(`/notifications/${notificationDbId}/read`, null, {
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (__DEV__) console.log('[NotificationsProvider] marked read by DB id', notificationDbId)
        await refresh()
        return
      } catch (e: any) {
        if (__DEV__) {
          console.log(
            '[NotificationsProvider] mark read by DB id failed',
            e?.response?.status,
            e?.message
          )
        }
      }
    }

    // 2) Fallback: buscar por orderId (+ type)
    if (!orderId) return

    try {
      const { data } = await api.get('/notifications', {
        params: { limit: 50 },
        headers: { 'Cache-Control': 'no-cache' },
      })
      const items: any[] = Array.isArray(data?.items) ? data.items : []

      const match = items.find((n) => {
        if (n?.readAt) return false
        const nd = n?.data ?? {}
        const nOrderId = nd?.orderId ?? nd?.order_id ?? nd?.order?.id ?? null
        if (!nOrderId || String(nOrderId) !== String(orderId)) return false

        if (type && n?.type) return String(n.type) === String(type)
        return true
      })

      if (!match?.id) {
        if (__DEV__)
          console.log('[NotificationsProvider] fallback: no unread notif matched for orderId', orderId)
        await refresh()
        return
      }

      await api.patch(`/notifications/${match.id}/read`, null, {
        headers: { 'Cache-Control': 'no-cache' },
      })

      if (__DEV__)
        console.log('[NotificationsProvider] fallback: marked read by search match', match.id)

      await refresh()
    } catch (e: any) {
      if (__DEV__) {
        console.log(
          '[NotificationsProvider] fallback mark read failed',
          e?.response?.status,
          e?.message
        )
      }
    }
  }

  // ✅ Registro push
  useEffect(() => {
    let cancelled = false

    if (!ready || !token) {
      setExpoPushToken(null)
      return
    }

    ;(async () => {
      try {
        const pushToken = await registerForPush()
        if (cancelled) return

        setExpoPushToken(pushToken)

        if (__DEV__) {
          console.log('[push] expoPushToken =', pushToken)
        }

        await api.post(
          '/notifications/push-token',
          { token: pushToken, platform: Platform.OS },
          { headers: { 'Cache-Control': 'no-cache' } }
        )
      } catch (e) {
        if (__DEV__) console.log('[push] registerForPush failed', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready, token])

  // ✅ Polling de unread
  useEffect(() => {
    let active = true

    if (!token) {
      setUnread(0)
      return
    }

    refresh()

    const id = setInterval(() => {
      if (active) refresh()
    }, 12000)

    return () => {
      active = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  /**
   * ✅ Tap en notificación (banner del sistema / tray)
   */
  useEffect(() => {
    if (!ready) return

    const role = user?.role ?? null

    const handleNavFromResponse = async (resp: Notifications.NotificationResponse | null) => {
      if (!resp) return

      const expoIdentifier = resp.notification?.request?.identifier ?? null

      if (expoIdentifier && lastHandledNotificationIdRef.current === expoIdentifier) {
        if (__DEV__) console.log('[NotificationsProvider] duplicated notif tap ignored', expoIdentifier)
        return
      }
      if (expoIdentifier) lastHandledNotificationIdRef.current = expoIdentifier

      const { orderId, threadId, type, data, notificationDbId } = extractDataFromResponse(resp)

      if (__DEV__) {
        console.log('────────────────────────')
        console.log('[NotifTap] expoIdentifier =', expoIdentifier)
        console.log('[NotifTap] type =', type)
        console.log('[NotifTap] data =', data)
        console.log('[NotifTap] orderId =', orderId)
        console.log('[NotifTap] threadId =', threadId)
        console.log('[NotifTap] notificationDbId =', notificationDbId)
        console.log('[NotifTap] role =', role)
        console.log('────────────────────────')
      }

      // ✅ 1) marcar como leída YA (sin bloquear navegación)
      markTappedNotificationAsRead({
        notificationDbId: notificationDbId ? String(notificationDbId) : null,
        orderId: orderId ? String(orderId) : null,
        type: type ? String(type) : null,
      })

      // ✅ 2) navegar: CHAT_MESSAGE -> thread; fallback -> order
      if (String(type) === 'CHAT_MESSAGE' && threadId) {
        navigateToChatThread(String(threadId), orderId ? String(orderId) : null)
        return
      }

      if (orderId) {
        navigateToOrderDetail(String(orderId))
      }
    }

    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      handleNavFromResponse(resp)
    })

    ;(async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync()
        if (last) await handleNavFromResponse(last)
      } catch (e) {
        if (__DEV__) console.log('[NotificationsProvider] getLastNotificationResponseAsync error', e)
      }
    })()

    return () => {
      sub.remove()
    }
  }, [ready, user?.role, token])

  return (
    <NotificationsContext.Provider value={{ unread, refreshing, refresh, expoPushToken }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}








