//apps/backend/src/services/subscriptionGate.ts
import { prisma } from '../lib/prisma';

export type SubscriptionGate =
  | { ok: true; status: 'ACTIVE' | 'TRIALING' }
  | {
      ok: false;
      reason: 'NO_SPECIALIST_PROFILE' | 'SUBSCRIPTION_REQUIRED';
      status?: string | null;
    };

export async function canSpecialistBeVisible(userId: string): Promise<SubscriptionGate> {
  const specialist = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!specialist) return { ok: false, reason: 'NO_SPECIALIST_PROFILE' };

  const sub = await prisma.subscription.findUnique({
    where: { specialistId: specialist.id },
    select: { status: true, trialEnd: true, currentPeriodEnd: true },
  });

  if (!sub) return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: null };

  const now = new Date();

  // Trial vigente
  if (sub.status === 'TRIALING') {
    if (sub.trialEnd && sub.trialEnd > now) {
      return { ok: true, status: 'TRIALING' };
    }
    return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: 'PAST_DUE' };
  }

  // Suscripción activa vigente
  if (sub.status === 'ACTIVE') {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      return { ok: true, status: 'ACTIVE' };
    }
    return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: 'PAST_DUE' };
  }

  return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: sub.status };
}
