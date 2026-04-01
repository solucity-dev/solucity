import { createNotification } from './notificationService';
import { sendExpoPush } from './pushExpo';
import { prisma } from '../lib/prisma';

import type { Prisma } from '@prisma/client';

type ReminderReason =
  | 'INCOMPLETE_PROFILE'
  | 'SPECIALIST_ORDER_LIMIT_REACHED'
  | 'CUSTOMER_ORDER_LIMIT_REACHED';

type ReminderChannel = 'push' | 'email';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SPECIALIST_ACTIVE_LIMIT = 3;
const CUSTOMER_ACTIVE_LIMIT = 5;

async function pushToUser(params: {
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: params.userId, enabled: true },
    select: { token: true },
  });

  const toList = tokens.map((t) => t.token).filter(Boolean);
  if (!toList.length) return { ok: true, sent: 0 };

  await sendExpoPush(
    toList.map((to) => ({
      to,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      title: params.title,
      body: params.body,
      data: params.data,
    })),
  );

  return { ok: true, sent: toList.length };
}

async function wasReminderSentRecently(params: {
  userId: string;
  reason: ReminderReason;
  channel: ReminderChannel;
  withinMs: number;
}) {
  const since = new Date(Date.now() - params.withinMs);

  const existing = await prisma.notificationReminderLog.findFirst({
    where: {
      userId: params.userId,
      reason: params.reason,
      channel: params.channel,
      sentAt: { gte: since },
    },
    select: { id: true, sentAt: true },
    orderBy: { sentAt: 'desc' },
  });

  return !!existing;
}

async function logReminderSent(params: {
  userId: string;
  reason: ReminderReason;
  channel: ReminderChannel;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.notificationReminderLog.create({
    data: {
      userId: params.userId,
      reason: params.reason,
      channel: params.channel,
      metadata: params.metadata,
    },
  });
}

function normalizeStoredServiceModes(input: any): ('HOME' | 'OFFICE' | 'ONLINE')[] {
  const allowed = new Set(['HOME', 'OFFICE', 'ONLINE']);

  if (!Array.isArray(input)) return [];

  const out = Array.from(
    new Set(
      input
        .map((x) =>
          String(x ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((x) => allowed.has(x)),
    ),
  ).sort();

  return out as ('HOME' | 'OFFICE' | 'ONLINE')[];
}

function hasExplicitServiceModes(input: any): boolean {
  return normalizeStoredServiceModes(input).length > 0;
}

async function findIncompleteSpecialists() {
  const specialists = await prisma.specialistProfile.findMany({
    select: {
      id: true,
      userId: true,
      serviceModes: true,
      user: {
        select: {
          id: true,
          status: true,
          name: true,
          surname: true,
        },
      },
      specialties: {
        select: {
          id: true,
        },
      },
    },
  });

  return specialists
    .filter((s) => s.user?.status === 'ACTIVE')
    .map((s) => {
      const specialtiesCount = s.specialties.length;
      const serviceModesConfigured = hasExplicitServiceModes(s.serviceModes);

      return {
        specialistId: s.id,
        userId: s.userId,
        name: `${s.user?.name ?? ''} ${s.user?.surname ?? ''}`.trim() || 'Especialista',
        specialtiesCount,
        serviceModesConfigured,
        profileIncomplete: specialtiesCount === 0 || !serviceModesConfigured,
      };
    })
    .filter((s) => s.profileIncomplete);
}

async function countActiveOrdersForSpecialist(specialistId: string) {
  return prisma.serviceOrder.count({
    where: {
      specialistId,
      status: { in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
    },
  });
}

async function countActiveOrdersForCustomer(customerId: string) {
  return prisma.serviceOrder.count({
    where: {
      customerId,
      status: { in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'IN_CLIENT_REVIEW'] },
    },
  });
}

export async function sendIncompleteProfileReminders() {
  const incomplete = await findIncompleteSpecialists();

  let checked = 0;
  let sent = 0;
  let skippedRecent = 0;

  for (const item of incomplete) {
    checked++;

    const alreadySent = await wasReminderSentRecently({
      userId: item.userId,
      reason: 'INCOMPLETE_PROFILE',
      channel: 'push',
      withinMs: THREE_DAYS_MS,
    });

    if (alreadySent) {
      skippedRecent++;
      continue;
    }

    const title = 'Completá tu perfil profesional';
    const body =
      item.specialtiesCount === 0 && !item.serviceModesConfigured
        ? 'Te faltan rubros y modalidades para completar tu perfil y poder recibir trabajos.'
        : !item.serviceModesConfigured
          ? 'Configurá tus modalidades de servicio para poder recibir trabajos.'
          : 'Seleccioná al menos un rubro para completar tu perfil profesional.';

    const notif = await createNotification({
      userId: item.userId,
      type: 'ACCOUNT_STATUS_CHANGED',
      title,
      body,
      data: {
        reason: 'INCOMPLETE_PROFILE',
        specialistId: item.specialistId,
        specialtiesCount: item.specialtiesCount,
        serviceModesConfigured: item.serviceModesConfigured,
      } as any,
    });

    await pushToUser({
      userId: item.userId,
      title: notif.title ?? title,
      body: notif.body ?? body,
      data: {
        notificationId: notif.id,
        type: 'INCOMPLETE_PROFILE',
        reason: 'INCOMPLETE_PROFILE',
        specialistId: item.specialistId,
      },
    });

    await logReminderSent({
      userId: item.userId,
      reason: 'INCOMPLETE_PROFILE',
      channel: 'push',
      metadata: {
        specialistId: item.specialistId,
        specialtiesCount: item.specialtiesCount,
        serviceModesConfigured: item.serviceModesConfigured,
      },
    });

    sent++;
  }

  return { ok: true, checked, sent, skippedRecent };
}

export async function sendSpecialistOrderLimitReminders() {
  const specialists = await prisma.specialistProfile.findMany({
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          status: true,
        },
      },
    },
  });

  let checked = 0;
  let sent = 0;
  let skippedRecent = 0;

  for (const spec of specialists) {
    if (spec.user?.status !== 'ACTIVE') continue;

    checked++;

    const activeOrders = await countActiveOrdersForSpecialist(spec.id);
    if (activeOrders < SPECIALIST_ACTIVE_LIMIT) continue;

    const alreadySent = await wasReminderSentRecently({
      userId: spec.userId,
      reason: 'SPECIALIST_ORDER_LIMIT_REACHED',
      channel: 'push',
      withinMs: THREE_DAYS_MS,
    });

    if (alreadySent) {
      skippedRecent++;
      continue;
    }

    const title = 'Llegaste al límite de trabajos';
    const body =
      'Ya tenés 3 trabajos activos. Finalizá o cancelá al menos uno para volver a recibir solicitudes.';

    const notif = await createNotification({
      userId: spec.userId,
      type: 'ACCOUNT_STATUS_CHANGED',
      title,
      body,
      data: {
        reason: 'SPECIALIST_ORDER_LIMIT_REACHED',
        specialistId: spec.id,
        activeOrders,
        limit: SPECIALIST_ACTIVE_LIMIT,
      } as any,
    });

    await pushToUser({
      userId: spec.userId,
      title: notif.title ?? title,
      body: notif.body ?? body,
      data: {
        notificationId: notif.id,
        type: 'SPECIALIST_ORDER_LIMIT_REACHED',
        reason: 'SPECIALIST_ORDER_LIMIT_REACHED',
        specialistId: spec.id,
        activeOrders,
        limit: SPECIALIST_ACTIVE_LIMIT,
      },
    });

    await logReminderSent({
      userId: spec.userId,
      reason: 'SPECIALIST_ORDER_LIMIT_REACHED',
      channel: 'push',
      metadata: {
        specialistId: spec.id,
        activeOrders,
        limit: SPECIALIST_ACTIVE_LIMIT,
      },
    });

    sent++;
  }

  return { ok: true, checked, sent, skippedRecent };
}

export async function sendCustomerOrderLimitReminders() {
  const customers = await prisma.customerProfile.findMany({
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          status: true,
        },
      },
    },
  });

  let checked = 0;
  let sent = 0;
  let skippedRecent = 0;

  for (const customer of customers) {
    if (customer.user?.status !== 'ACTIVE') continue;

    checked++;

    const activeOrders = await countActiveOrdersForCustomer(customer.id);
    if (activeOrders < CUSTOMER_ACTIVE_LIMIT) continue;

    const alreadySent = await wasReminderSentRecently({
      userId: customer.userId,
      reason: 'CUSTOMER_ORDER_LIMIT_REACHED',
      channel: 'push',
      withinMs: THREE_DAYS_MS,
    });

    if (alreadySent) {
      skippedRecent++;
      continue;
    }

    const title = 'Llegaste al límite de órdenes';
    const body =
      'Ya tenés 5 órdenes activas o en revisión. Confirmá o cerrá alguna para poder crear una nueva solicitud.';

    const notif = await createNotification({
      userId: customer.userId,
      type: 'ACCOUNT_STATUS_CHANGED',
      title,
      body,
      data: {
        reason: 'CUSTOMER_ORDER_LIMIT_REACHED',
        customerId: customer.id,
        activeOrders,
        limit: CUSTOMER_ACTIVE_LIMIT,
      } as any,
    });

    await pushToUser({
      userId: customer.userId,
      title: notif.title ?? title,
      body: notif.body ?? body,
      data: {
        notificationId: notif.id,
        type: 'CUSTOMER_ORDER_LIMIT_REACHED',
        reason: 'CUSTOMER_ORDER_LIMIT_REACHED',
        customerId: customer.id,
        activeOrders,
        limit: CUSTOMER_ACTIVE_LIMIT,
      },
    });

    await logReminderSent({
      userId: customer.userId,
      reason: 'CUSTOMER_ORDER_LIMIT_REACHED',
      channel: 'push',
      metadata: {
        customerId: customer.id,
        activeOrders,
        limit: CUSTOMER_ACTIVE_LIMIT,
      },
    });

    sent++;
  }

  return { ok: true, checked, sent, skippedRecent };
}

export async function runReminderJobs() {
  const [incompleteProfiles, specialistLimits, customerLimits] = await Promise.all([
    sendIncompleteProfileReminders(),
    sendSpecialistOrderLimitReminders(),
    sendCustomerOrderLimitReminders(),
  ]);

  return {
    ok: true,
    incompleteProfiles,
    specialistLimits,
    customerLimits,
  };
}
