// apps/mobile/src/lib/subscriptionApi.ts
import { api } from './api';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  daysRemaining: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

// 🔒 cache en memoria (vive mientras la app esté abierta)
let cachedSubscription: SubscriptionInfo | null = null;
let inFlight: Promise<SubscriptionInfo | null> | null = null;

export async function getMySubscription(options?: {
  force?: boolean;
}): Promise<SubscriptionInfo | null> {
  const force = options?.force === true;

  // ✅ si ya la tenemos y no forzamos, devolvemos cache
  if (cachedSubscription && !force) {
    return cachedSubscription;
  }

  // ✅ si ya hay un request en curso, reutilizamos
  if (inFlight && !force) {
    return inFlight;
  }

  inFlight = (async () => {
    const res = await api.get('/subscriptions/me');

    if (!res.data?.ok) {
      throw new Error('bad_response');
    }

    cachedSubscription = res.data.subscription ?? null;
    return cachedSubscription;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// 🔁 helper opcional (cuando quieras refrescar)
export function clearSubscriptionCache() {
  cachedSubscription = null;
}
