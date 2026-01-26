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

/**
 * ✅ Crea notificación en DB con dedupe simple (24h)
 * ✅ Push con notificationId (tap → mark-as-read / deep link)
 * ✅ Sin duplicar lógica de batching (lo hace pushExpo.ts)
 */
export async function notifySubscription(args: NotifyArgs) {
  const { userId, type, title, body, data } = args;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[notifySubscription]', { userId, type, time: new Date().toISOString() });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ✅ DEDUPE: misma combinación (type + subscriptionEvent) en últimas 24h
  const exists = await prisma.notification.findFirst({
    where: {
      userId,
      type: type as any,
      createdAt: { gte: since },
      AND: [
        {
          data: {
            path: ['subscriptionEvent'],
            equals: type,
          },
        },
      ],
    },
    select: { id: true },
  });

  if (exists) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifySubscription] deduped -> notificationId=', exists.id);
    }
    return { ok: true, skipped: true, notificationId: exists.id };
  }

  // 1) DB notification
  const notif = await createNotification({
    userId,
    type: type as NotificationType,
    title,
    body,
    data: {
      ...(data ?? {}),
      subscriptionEvent: type, // ✅ clave dedupe
    } as any,
  });

  // 2) tokens
  const tokens = await prisma.pushToken.findMany({
    where: { userId, enabled: true },
    select: { token: true },
  });

  const toList = tokens.map((t) => t.token).filter(Boolean);

  if (!toList.length) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifySubscription] no tokens -> dbOnly notificationId=', notif.id);
    }
    return { ok: true, notificationId: notif.id, pushed: false };
  }

  // 3) push (no rompe si falla)
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
          type,
          notificationId: notif.id,
        },
      })),
    );
  } catch (e) {
    console.warn('[notifySubscription] sendExpoPush failed', e);
    return { ok: true, notificationId: notif.id, pushed: false };
  }

  return { ok: true, notificationId: notif.id, pushed: true };
}
