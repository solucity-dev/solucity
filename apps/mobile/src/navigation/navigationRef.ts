import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

type NavRole = 'SPECIALIST' | 'CUSTOMER' | 'ADMIN' | null;

let navRole: NavRole = null;

type PendingNav =
  | { type: 'orderDetail'; orderId: string }
  | { type: 'chatThread'; threadId: string; orderId?: string | null }
  | { type: 'backgroundCheck' }
  | null;

let pendingNav: PendingNav = null;

export function setNavRole(role: NavRole) {
  navRole = role;
  if (__DEV__) console.log('[NAV] setNavRole =', role);
  flushPendingNav();
}

export function queueOrderDetail(orderId: string) {
  pendingNav = { type: 'orderDetail', orderId };
  if (__DEV__) console.log('[NAV] queued orderDetail =', orderId);
}

export function queueChatThread(threadId: string, orderId?: string | null) {
  pendingNav = { type: 'chatThread', threadId, orderId: orderId ?? null };
  if (__DEV__) console.log('[NAV] queued chatThread =', threadId, 'orderId=', orderId);
}

export function queueBackgroundCheck() {
  pendingNav = { type: 'backgroundCheck' };
  if (__DEV__) console.log('[NAV] queued backgroundCheck');
}

export function flushPendingNav() {
  if (!pendingNav) return;
  if (!navigationRef.isReady()) return;

  const p = pendingNav;
  pendingNav = null;

  if (p.type === 'orderDetail') {
    navigateToOrderDetail(p.orderId);
  } else if (p.type === 'chatThread') {
    navigateToChatThread(p.threadId, p.orderId ?? null);
  } else if (p.type === 'backgroundCheck') {
    navigateToBackgroundCheck();
  }
}

export function navigateToSubscription() {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Subscription' as never);
}

/**
 * ✅ Navegación global al OrderDetail
 */
export function navigateToOrderDetail(orderId: string) {
  if (!navigationRef.isReady() || !navRole) {
    queueOrderDetail(orderId);
    return;
  }

  const isSpecialist = navRole === 'SPECIALIST';
  const root = isSpecialist ? 'MainSpecialist' : 'Main';

  navigationRef.navigate(root, {
    screen: 'Agenda',
    params: {
      screen: 'OrderDetail',
      params: {
        id: orderId,
        role: isSpecialist ? 'specialist' : 'customer',
        from: 'notif-tap',
        refreshAt: Date.now(),
      },
    },
  });
}

/**
 * ✅ Navegación global al chat thread
 */
export function navigateToChatThread(threadId: string, orderId?: string | null) {
  if (!navigationRef.isReady() || !navRole) {
    queueChatThread(threadId, orderId ?? null);
    return;
  }

  const isSpecialist = navRole === 'SPECIALIST';
  const root = isSpecialist ? 'MainSpecialist' : 'Main';

  if (__DEV__) {
    console.log(
      '[NAV] navigateToChatThread -> root=',
      root,
      'threadId=',
      threadId,
      'orderId=',
      orderId,
    );
  }

  navigationRef.navigate(root, {
    screen: 'Chat',
    params: {
      screen: 'ChatThread',
      params: {
        threadId,
        orderId: orderId ?? undefined,
      },
    },
  });
}

export function navigateToBackgroundCheck() {
  if (!navigationRef.isReady() || navRole !== 'SPECIALIST') {
    queueBackgroundCheck();
    return;
  }

  // Solo existe en flujo specialist (según tu diseño)
  const root = 'MainSpecialist';

  navigationRef.navigate(root, {
    screen: 'Perfil',
    params: {
      screen: 'BackgroundCheck',
    },
  });
}
