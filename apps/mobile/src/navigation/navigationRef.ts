// apps/mobile/src/navigation/navigationRef.ts
import { createNavigationContainerRef } from '@react-navigation/native'

export const navigationRef = createNavigationContainerRef<any>()

type NavRole = 'SPECIALIST' | 'CUSTOMER' | 'ADMIN' | null

let navRole: NavRole = null

type PendingNav =
  | { type: 'orderDetail'; orderId: string }
  | { type: 'chatThread'; threadId: string; orderId?: string | null }
  | null

let pendingNav: PendingNav = null

export function setNavRole(role: NavRole) {
  navRole = role
  if (__DEV__) console.log('[NAV] setNavRole =', role)
    // ✅ si había navegación pendiente y ahora ya sabemos el rol
  flushPendingNav()
}

export function queueOrderDetail(orderId: string) {
  pendingNav = { type: 'orderDetail', orderId }
  if (__DEV__) console.log('[NAV] queued orderDetail =', orderId)
}

export function queueChatThread(threadId: string, orderId?: string | null) {
  pendingNav = { type: 'chatThread', threadId, orderId: orderId ?? null }
  if (__DEV__) console.log('[NAV] queued chatThread =', threadId, 'orderId=', orderId)
}

export function flushPendingNav() {
  if (!pendingNav) return
  if (!navigationRef.isReady()) return

  const p = pendingNav
  pendingNav = null

  if (p.type === 'orderDetail') {
    navigateToOrderDetail(p.orderId)
  } else if (p.type === 'chatThread') {
    navigateToChatThread(p.threadId, p.orderId ?? null)
  }
}

/**
 * ✅ Navegación global al OrderDetail:
 */
export function navigateToOrderDetail(orderId: string) {
  if (!navigationRef.isReady()) {
    queueOrderDetail(orderId)
    return
  }

  const isSpecialist = navRole === 'SPECIALIST'
  const root = isSpecialist ? 'MainSpecialist' : 'Main'

  navigationRef.navigate(root, {
    screen: 'Agenda',
    params: {
      // SpecialistTabs usa AgendaMain como primera, pero navegar directo a OrderDetail funciona igual
      screen: 'OrderDetail',
      params: {
        id: orderId,
        role: isSpecialist ? 'specialist' : 'customer',
        from: 'notif-tap',
      },
    },
  })
}

/**
 * ✅ NUEVO: Navegación global al chat thread:
 * - Va al Tab "Chat"
 * - Abre "ChatThread" dentro del ChatStack
 * - Pasa threadId y (si existe) orderId
 */
export function navigateToChatThread(threadId: string, orderId?: string | null) {
  if (!navigationRef.isReady()) {
    queueChatThread(threadId, orderId ?? null)
    return
  }

  const isSpecialist = navRole === 'SPECIALIST'
  const root = isSpecialist ? 'MainSpecialist' : 'Main'

  if (__DEV__) {
    console.log('[NAV] navigateToChatThread -> root=', root, 'threadId=', threadId, 'orderId=', orderId)
  }

  navigationRef.navigate(root, {
    screen: 'Chat',
    params: {
      screen: 'ChatThread',
      params: {
        threadId,
        orderId: orderId ?? undefined,
        // opcional: el título lo resuelve ChatList normalmente,
        // pero si en el futuro lo querés, podés mandarlo.
        // title: 'Chat',
      },
    },
  })
}




