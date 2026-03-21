// apps/backend/src/services/notifySubscription.ts
import { createNotification, type NotificationType } from './notificationService';
import { sendExpoPush } from './pushExpo';
import { prisma } from '../lib/prisma';

type NotifyArgs = {
  userId: string;
  type:
    | 'SUBSCRIPTION_TRIAL_ENDING'
    | 'SUBSCRIPTION_TRIAL_ENDED'
    | 'SUBSCRIPTION_ACTIVE'
    | 'SUBSCRIPTION_PAST_DUE';
  title: string;
  body: string;
  data?: Record<string, any>;
};

function buildEventKey(args: NotifyArgs) {
  const explicitKey = args.data?.subscriptionEventKey;
  if (explicitKey) return String(explicitKey);

  return String(args.type);
}

/**
 * ✅ Crea notificación en DB con dedupe más preciso
 * ✅ Push con notificationId
 * ✅ Logs claros para debug
 */
export async function notifySubscription(args: NotifyArgs) {
  const { userId, type, title, body, data } = args;

  const subscriptionEventKey = buildEventKey(args);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[notifySubscription] start', {
      userId,
      type,
      subscriptionEventKey,
      time: new Date().toISOString(),
    });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ✅ DEDUPE por clave exacta del evento
  const exists = await prisma.notification.findFirst({
    where: {
      userId,
      type: type as any,
      createdAt: { gte: since },
      AND: [
        {
          data: {
            path: ['subscriptionEventKey'],
            equals: subscriptionEventKey,
          },
        },
      ],
    },
    select: { id: true },
  });

  if (exists) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifySubscription] deduped', {
        userId,
        type,
        subscriptionEventKey,
        notificationId: exists.id,
      });
    }

    return { ok: true, skipped: true, notificationId: exists.id };
  }

  // 1) Guardar en DB
  const notif = await createNotification({
    userId,
    type: type as NotificationType,
    title,
    body,
    data: {
      ...(data ?? {}),
      subscriptionEvent: type,
      subscriptionEventKey,
    } as any,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[notifySubscription] db notification created', {
      userId,
      type,
      subscriptionEventKey,
      notificationId: notif.id,
    });
  }

  // 2) Buscar tokens push
  const tokens = await prisma.pushToken.findMany({
    where: { userId, enabled: true },
    select: { token: true },
  });

  const toList = tokens.map((t) => t.token).filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[notifySubscription] push tokens', {
      userId,
      count: toList.length,
    });
  }

  if (!toList.length) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifySubscription] no tokens, db only', {
        userId,
        notificationId: notif.id,
      });
    }

    return { ok: true, notificationId: notif.id, pushed: false };
  }

  // 3) Push
  try {
    await sendExpoPush(
      toList.map((to) => ({
        to,
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
        title,
        body,
        data: {
          ...(data ?? {}),
          subscriptionEvent: type,
          subscriptionEventKey,
          type,
          notificationId: notif.id,
          screen: data?.screen ?? 'Subscription',
        },
      })),
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifySubscription] push sent', {
        userId,
        notificationId: notif.id,
        tokens: toList.length,
      });
    }

    return { ok: true, notificationId: notif.id, pushed: true };
  } catch (e) {
    console.warn('[notifySubscription] sendExpoPush failed', e);
    return { ok: true, notificationId: notif.id, pushed: false };
  }
}
