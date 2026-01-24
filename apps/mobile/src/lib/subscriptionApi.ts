// apps/mobile/src/lib/subscriptionApi.ts
import { api } from './api';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

export type SubscriptionInfo = {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  daysRemaining: number | null;
};

// 🔒 cache en memoria (vive mientras la app esté abierta)
let cachedSubscription: SubscriptionInfo | null = null;
let inFlight: Promise<SubscriptionInfo | null> | null = null;

export async function getMySubscription(options?: {
  force?: boolean;
}): Promise<SubscriptionInfo | null> {
  const force = options?.force === true;

  if (cachedSubscription && !force) return cachedSubscription;
  if (inFlight && !force) return inFlight;

  inFlight = (async () => {
    const res = await api.get('/subscriptions/me');

    if (!res.data?.ok) throw new Error('bad_response');

    cachedSubscription = (res.data?.subscription ?? null) as SubscriptionInfo | null;
    return cachedSubscription;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function clearSubscriptionCache() {
  cachedSubscription = null;
}

export async function createSubscriptionPaymentLink(): Promise<{
  subscriptionId: string;
  mpPreferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
}> {
  const res = await api.post('/subscriptions/pay/link');

  if (!res.data?.ok) throw new Error('bad_response');

  return {
    subscriptionId: String(res.data?.subscriptionId || ''),
    mpPreferenceId: String(res.data?.mpPreferenceId || ''),
    initPoint: String(res.data?.initPoint || ''),
    sandboxInitPoint: String(res.data?.sandboxInitPoint || ''),
  };
}
