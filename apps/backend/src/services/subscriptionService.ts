// apps/backend/src/services/subscriptionService.ts
import { mpCreatePaymentLink, mpGetPayment } from './mercadopago';
import { notifyAdmins } from './notificationService';
import { notifySubscription } from './notifySubscription';
import { prisma } from '../lib/prisma';

const TRIAL_DAYS = 30;
const SUBSCRIPTION_PRICE_ARS = 15000;

function addOneCalendarMonth(date: Date) {
  const d = new Date(date);
  const day = d.getDate();

  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();

  next.setDate(Math.min(day, lastDay));
  return next;
}

function getPublicBackendUrl() {
  const url = process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (!url) throw new Error('PUBLIC_BACKEND_URL missing');
  return url.replace(/\/+$/, '');
}

async function getUserIdFromSubscription(subId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subId },
    select: {
      id: true,
      specialistId: true,

      // ✅ campos que después usamos en handleMercadoPagoWebhook
      currentPeriodEnd: true,
      lastPaymentId: true,

      specialist: { select: { userId: true } },
    },
  });

  const userId = sub?.specialist?.userId ?? null;
  return { sub, userId };
}

export async function getOrCreateSubscriptionForSpecialist(userId: string) {
  const specialist = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!specialist) return null;

  const now = new Date();

  const existing = await prisma.subscription.findUnique({
    where: { specialistId: specialist.id },
  });

  if (!existing) {
    const end = new Date(now);
    end.setDate(end.getDate() + TRIAL_DAYS);

    return prisma.subscription.upsert({
      where: { specialistId: specialist.id },
      create: {
        specialistId: specialist.id,
        status: 'TRIALING',
        currentPeriodStart: now,
        currentPeriodEnd: end,
        trialEnd: end,
      },
      update: {},
    });
  }

  // ⛔ Trial vencido → PAST_DUE + notificación
  if (existing.status === 'TRIALING' && existing.trialEnd && existing.trialEnd < now) {
    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'PAST_DUE' },
    });

    await notifySubscription({
      userId,
      type: 'SUBSCRIPTION_TRIAL_ENDED',
      title: 'Terminó tu prueba gratuita',
      body: 'Para seguir apareciendo en búsquedas y recibir trabajos, activá tu suscripción.',
      data: { screen: 'Subscription' },
    });

    return updated;
  }

  // 🔔 Avisos (3 y 1 día)
  if (existing.status === 'TRIALING' && existing.trialEnd && existing.trialEnd > now) {
    const diffMs = existing.trialEnd.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining === 3 || daysRemaining === 1) {
      await notifySubscription({
        userId,
        type: 'SUBSCRIPTION_TRIAL_ENDING',
        title: 'Tu prueba gratuita está por terminar',
        body:
          daysRemaining === 1
            ? 'Te queda 1 día gratis. Podés activar la suscripción cuando quieras.'
            : `Te quedan ${daysRemaining} días gratis. Podés activar la suscripción cuando quieras.`,
        data: { daysRemaining, screen: 'Subscription' },
      });
    }
  }

  return existing;
}

export async function createSubscriptionPaymentLink(userId: string) {
  const specialist = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      user: { select: { email: true } },
    },
  });

  if (!specialist) throw new Error('no_specialist_profile');

  const sub = await getOrCreateSubscriptionForSpecialist(userId);
  if (!sub) throw new Error('no_specialist_profile');

  const publicBackend = getPublicBackendUrl();

  const preference = await mpCreatePaymentLink({
    amount: SUBSCRIPTION_PRICE_ARS,
    email: specialist.user.email,
    externalReference: sub.id,
    reason: 'Solucity - Suscripción mensual (1 mes)',
    notificationUrl: `${publicBackend}/subscriptions/mercadopago/webhook`,
    successUrl: `${publicBackend}/subscriptions/return/success`,
    failureUrl: `${publicBackend}/subscriptions/return/failure`,
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      provider: 'MERCADOPAGO',
      providerSubId: String(preference?.id || ''),
      lastPaymentStatus: 'pending',
    },
  });

  return {
    subscriptionId: sub.id,
    mpPreferenceId: String(preference?.id || ''),
    initPoint: String(preference?.init_point || ''),
    sandboxInitPoint: String(preference?.sandbox_init_point || ''),
  };
}

export async function handleMercadoPagoWebhook(paymentId: string) {
  const payment = await mpGetPayment(paymentId);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[MP payment]', {
      paymentId,
      status: payment?.status,
      external_reference: payment?.external_reference,
      preference_id: payment?.preference_id,
    });
  }

  const status = String(payment?.status || '');
  const externalRef = String(payment?.external_reference || '');

  if (!externalRef) return;

  const found = await getUserIdFromSubscription(externalRef);
  const sub = found.sub;
  const userId = found.userId;

  if (!sub) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      provider: 'MERCADOPAGO',
      lastPaymentStatus: status || null,
    },
  });

  if (status !== 'approved') return;

  // ✅ IDEMPOTENCIA ROBUSTA: si ya guardamos este paymentId, no procesar 2 veces (race-safe)
  const mark = await prisma.subscription.updateMany({
    where: {
      id: sub.id,
      NOT: { lastPaymentId: paymentId },
    },
    data: {
      lastPaymentId: paymentId,
      lastPaymentStatus: 'approved',
      provider: 'MERCADOPAGO',
    },
  });

  if (mark.count === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MP webhook] deduped paymentId=', paymentId, 'subId=', sub.id);
    }
    return;
  }

  // ✅ Releer estado actual para calcular sobre datos frescos
  const fresh = await prisma.subscription.findUnique({
    where: { id: sub.id },
    select: { currentPeriodEnd: true },
  });

  const now = new Date();
  const currentEnd = fresh?.currentPeriodEnd ?? null;
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  const newEnd = addOneCalendarMonth(base);

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: base,
      currentPeriodEnd: newEnd,
      trialEnd: null,
    },
  });

  if (userId) {
    const specialist = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { email: true, name: true, surname: true } } },
    });

    await notifyAdmins({
      type: 'ADMIN_SPECIALIST_SUBSCRIBED',
      title: 'Especialista suscripto ✅',
      body: `${specialist?.user?.email ?? 'Especialista'} activó su suscripción`,
      data: {
        userId,
        specialistId: specialist?.id ?? null,
        subscriptionId: sub.id,
        status: 'ACTIVE',
        currentPeriodEnd: newEnd.toISOString(),
      },
    });
  }

  // ✅ Notificación “suscripción activa”
  if (userId) {
    await notifySubscription({
      userId,
      type: 'SUBSCRIPTION_ACTIVE',
      title: 'Suscripción activa ✅',
      body: 'Tu suscripción está activa. Ya podés recibir nuevos trabajos.',
      data: { screen: 'Subscription' },
    });
  }
}
