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
    select: { status: true, trialEnd: true },
  });

  if (!sub) return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: null };

  const now = new Date();

  if (sub.status === 'TRIALING' && sub.trialEnd && sub.trialEnd < now) {
    return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: 'PAST_DUE' };
  }

  if (sub.status === 'ACTIVE') return { ok: true, status: 'ACTIVE' };
  if (sub.status === 'TRIALING') return { ok: true, status: 'TRIALING' };

  return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: sub.status };
}
