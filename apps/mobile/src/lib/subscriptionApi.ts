// apps/mobile/src/lib/subscriptionApi.ts
import { api } from './api'

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED'

export type SubscriptionInfo = {
  status: SubscriptionStatus
  daysRemaining: number | null
  trialEndsAt: string | null
  currentPeriodEnd: string | null
}

export async function getMySubscription(): Promise<SubscriptionInfo | null> {
  const res = await api.get('/subscriptions/me')
  if (!res.data?.ok) throw new Error('bad_response')
  return res.data.subscription ?? null
}
