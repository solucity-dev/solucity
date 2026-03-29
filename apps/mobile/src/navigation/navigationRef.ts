//apps/mobile/src/navigation/navigationRef.ts
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

type NavMode = 'specialist' | 'client' | null;

let navMode: NavMode = null;

type PendingNav =
  | { type: 'orderDetail'; orderId: string }
  | { type: 'chatThread'; threadId: string; orderId?: string | null }
  | { type: 'backgroundCheck' }
  | { type: 'kycStatus' }
  | { type: 'subscription' }
  | null;

let pendingNav: PendingNav = null;

export function setNavMode(mode: NavMode) {
  navMode = mode;
  if (__DEV__) console.log('[NAV] setNavMode =', mode);
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

export function queueKycStatus() {
  pendingNav = { type: 'kycStatus' };
  if (__DEV__) console.log('[NAV] queued kycStatus');
}

export function queueSubscription() {
  pendingNav = { type: 'subscription' };
  if (__DEV__) console.log('[NAV] queued subscription');
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
  } else if (p.type === 'kycStatus') {
    navigateToKycStatus();
  } else if (p.type === 'subscription') {
    navigateToSubscription();
  }
}

export function navigateToSubscription() {
  try {
    if (!navigationRef.isReady()) {
      queueSubscription();
      return;
    }
    navigationRef.navigate('Subscription' as never);
  } catch (e) {
    if (__DEV__) console.log('[navigateToSubscription] error', e);
  }
}

export function navigateToKycStatus() {
  try {
    if (!navigationRef.isReady()) {
      queueKycStatus();
      return;
    }
    navigationRef.navigate('KycStatus' as never);
  } catch (e) {
    if (__DEV__) console.log('[navigateToKycStatus] error', e);
  }
}

/**
 * ✅ Navegación global al OrderDetail
 */
export function navigateToOrderDetail(orderId: string) {
  if (!navigationRef.isReady() || !navMode) {
    queueOrderDetail(orderId);
    return;
  }

  const isSpecialist = navMode === 'specialist';
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
  if (!navigationRef.isReady() || !navMode) {
    queueChatThread(threadId, orderId ?? null);
    return;
  }

  const isSpecialist = navMode === 'specialist';
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
  if (!navigationRef.isReady()) {
    queueBackgroundCheck();
    return;
  }

  // si ya sabemos el modo y no es specialist, descartamos
  if (navMode && navMode !== 'specialist') {
    if (__DEV__) console.log('[NAV] drop backgroundCheck nav (mode not specialist)');
    return;
  }

  // si todavía no sabemos modo, esperamos
  if (!navMode) {
    queueBackgroundCheck();
    return;
  }

  navigationRef.navigate('MainSpecialist', {
    screen: 'Perfil',
    params: {
      screen: 'BackgroundCheck',
    },
  });
}
