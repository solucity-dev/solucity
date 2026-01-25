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
 * ✅ Crea notificación en DB con dedupe simple para no spamear:
 * no crea otra igual si ya existe una del mismo type en las últimas 24h.
 */
export async function notifySubscription(args: NotifyArgs) {
  const { userId, type, title, body, data } = args;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const exists = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      createdAt: { gte: since },
    },
    select: { id: true },
  });

  if (exists) return { ok: true, skipped: true };

  const notif = await createNotification({
    userId,
    type: type as NotificationType,
    title,
    body,
    data: (data ?? {}) as any,
  });

  // ✅ Push: si tenés tokens, mandamos push (sin romper si falla)
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId, enabled: true },
      select: { token: true },
    });

    const expoTokens = tokens.map((t) => t.token).filter(Boolean);
    if (!expoTokens.length) return { ok: true, id: notif.id, pushed: false };

    // Expo push endpoint
    // OJO: Expo recomienda batches (100)
    const chunks: string[][] = [];
    for (let i = 0; i < expoTokens.length; i += 100) chunks.push(expoTokens.slice(i, i + 100));

    for (const chunk of chunks) {
      const messages = chunk.map((to) => ({
        to,
        sound: 'default',
        title,
        body,
        data: {
          ...(data ?? {}),
          type,
          notificationId: notif.id, // ✅ para mark-as-read directo
        },
      }));

      await sendExpoPush(messages as any);
    }

    return { ok: true, id: notif.id, pushed: true };
  } catch {
    return { ok: true, id: notif.id, pushed: false };
  }
}
