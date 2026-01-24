// apps/backend/src/services/subscriptionService.ts
import { mpCreatePaymentLink, mpGetPayment } from './mercadopago';
import { prisma } from '../lib/prisma';

const TRIAL_DAYS = 30;
const SUBSCRIPTION_PRICE_ARS = 15000;

/**
 * Mensual calendario (aniversario):
 * - 15 feb -> 15 mar
 * - 31 ene -> 28/29 feb (último día del mes)
 */
function addOneCalendarMonth(date: Date) {
  const d = new Date(date);
  const day = d.getDate();

  // ir al 1 del mes siguiente
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);

  // último día del mes siguiente
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();

  // mantener el mismo día o “clamp” al último
  next.setDate(Math.min(day, lastDay));
  return next;
}

/**
 * Construye URL pública del backend para webhooks/back_urls.
 * IMPORTANTE: en Render seteá PUBLIC_BACKEND_URL=https://solucity-backend.onrender.com
 * (o tu dominio final cuando exista)
 */
function getPublicBackendUrl() {
  const url = process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (!url) {
    throw new Error('PUBLIC_BACKEND_URL missing');
  }
  return url.replace(/\/+$/, '');
}

export async function getOrCreateSubscriptionForSpecialist(userId: string) {
  // 1) Buscar el perfil de especialista de ese usuario
  const specialist = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!specialist) return null;

  const now = new Date();

  // 2) Traer suscripción si existe
  const existing = await prisma.subscription.findUnique({
    where: { specialistId: specialist.id },
  });

  // 3) Si no existe → crear TRIAL (idempotente / anti-race)
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
      update: {}, // ✅ si otra request ganó la carrera, no tocamos nada
    });
  }

  // 4) Si existe y estaba en TRIAL y se venció → marcar como PAST_DUE
  if (existing.status === 'TRIALING' && existing.trialEnd && existing.trialEnd < now) {
    return prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'PAST_DUE' },
    });
  }

  // 5) Para todos los demás casos, devolver tal cual
  return existing;
}

/**
 * Crea un link de pago (Checkout Preference) para 1 mes.
 * Reglas:
 * - Si está en trial y NO venció => error "trial_active"
 * - Si no tiene perfil especialista => error "no_specialist_profile"
 */
export async function createSubscriptionPaymentLink(userId: string) {
  const specialist = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      user: { select: { email: true } },
    },
  });

  if (!specialist) throw new Error('no_specialist_profile');

  // asegura trial / status correcto
  const sub = await getOrCreateSubscriptionForSpecialist(userId);
  if (!sub) throw new Error('no_specialist_profile');

  const now = new Date();

  // Trial activo: NO corresponde pagar aún
  if (sub.status === 'TRIALING' && sub.trialEnd && sub.trialEnd > now) {
    throw new Error('trial_active');
  }

  const publicBackend = getPublicBackendUrl();

  // Creamos preference, external_reference = subscription.id
  const preference = await mpCreatePaymentLink({
    amount: SUBSCRIPTION_PRICE_ARS,
    email: specialist.user.email,
    externalReference: sub.id,
    reason: 'Solucity - Suscripción mensual (1 mes)',
    notificationUrl: `${publicBackend}/subscriptions/mercadopago/webhook`,
    successUrl: `${publicBackend}/subscriptions/return/success`,
    failureUrl: `${publicBackend}/subscriptions/return/failure`,
  });

  // ✅ Guardamos metadata MP en tu modelo actual
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      provider: 'MERCADOPAGO',
      providerSubId: String(preference?.id || ''), // guardamos preferenceId
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

/**
 * Webhook handler:
 * - Lee paymentId
 * - Consulta MP /v1/payments/:id
 * - Guarda lastPaymentStatus siempre
 * - Si approved => activa / renueva 1 mes calendario
 */
export async function handleMercadoPagoWebhook(paymentId: string) {
  const payment = await mpGetPayment(paymentId);

  const status = String(payment?.status || '');
  const externalRef = String(payment?.external_reference || '');

  if (!externalRef) return;

  // external_reference = subscriptionId
  const sub = await prisma.subscription.findUnique({ where: { id: externalRef } });
  if (!sub) return;

  // ✅ Guardamos último estado aunque NO sea approved (para debug real)
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      provider: 'MERCADOPAGO',
      lastPaymentStatus: status || null,
    },
  });

  // Solo renovamos si approved
  if (status !== 'approved') return;

  const now = new Date();

  // Renovación desde el vencimiento si sigue activo, si no desde ahora
  const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
  const newStart = base;
  const newEnd = addOneCalendarMonth(base);

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: newStart,
      currentPeriodEnd: newEnd,
      trialEnd: null,
      lastPaymentStatus: 'approved',
    },
  });
}
