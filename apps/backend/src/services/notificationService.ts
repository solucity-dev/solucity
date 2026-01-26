//apps/backend/src/services/notificationService.ts
import { Prisma } from '@prisma/client';

import { sendExpoPush } from './pushExpo';
import { prisma } from '../lib/prisma';

// 🔐 Tipos de notificación soportados
export type NotificationType =
  | 'ORDER_NEW_REQUEST'
  | 'ORDER_ACCEPTED_BY_SPECIALIST'
  | 'ORDER_REJECTED_BY_SPECIALIST'
  | 'ORDER_REMINDER_UPCOMING'
  | 'ORDER_SCHEDULE_CHANGED'
  | 'NEW_CHAT_MESSAGE'
  | 'ORDER_FINISHED'
  | 'NEW_REVIEW_POSTED'
  | 'KYC_STATUS'
  | 'CERTIFICATION_APPROVED'
  | 'CERTIFICATION_REJECTED'
  | 'BACKGROUND_CHECK_STATUS'
  | 'BACKGROUND_CHECK_REVIEW_REQUEST'
  | 'SUBSCRIPTION_DAYS_GRANTED'
  | 'SUBSCRIPTION_TRIAL_ENDING'
  | 'SUBSCRIPTION_TRIAL_ENDED'
  | 'SUBSCRIPTION_ACTIVE'
  | 'SUBSCRIPTION_PAST_DUE'

  // ✅ ADMIN
  | 'ACCOUNT_STATUS_CHANGED'
  | 'ADMIN_NEW_USER_REGISTERED'
  | 'ADMIN_SPECIALIST_SUBSCRIBED';

// Base común de data (se guarda como JSON)
export interface BaseNotificationData extends Prisma.JsonObject {
  orderId?: string;
  customerId?: string;
  specialistId?: string;
  serviceId?: string;
}

// Card: Nueva solicitud
export interface OrderNewRequestData extends BaseNotificationData {
  type: 'ORDER_NEW_REQUEST';
  categoryName: string;
  customerName: string;
  distanceKm?: number;
  scheduledAt?: string;
  shortDescription?: string;
  attachments?: string[];
  isUrgent?: boolean;
}

/**
 * ✅ Helper central para crear notificaciones en DB
 *
 * IMPORTANTE:
 * - El `id` que retorna esta función DEBE
 *   viajar luego en el push como `notificationId`
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.JsonValue;
}) {
  const { userId, type, title, body, data } = params;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: data ?? undefined,
    },
  });

  return notification;
}

export async function notifyAdmins(params: {
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.JsonValue;
}) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });

  if (!admins.length) return { ok: true, admins: 0, pushed: 0 };

  // 1) DB notifications (1 por admin)
  const created = await prisma.$transaction(
    admins.map((a) =>
      prisma.notification.create({
        data: {
          userId: a.id,
          type: params.type,
          title: params.title,
          body: params.body,
          data: params.data ?? undefined,
        },
        select: { id: true, userId: true },
      }),
    ),
  );

  // 2) Push a cada admin si tiene tokens
  let pushed = 0;

  for (const n of created) {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: n.userId, enabled: true },
      select: { token: true },
    });

    const toList = tokens.map((t) => t.token).filter(Boolean);
    if (!toList.length) continue;

    try {
      await sendExpoPush(
        toList.map((to) => ({
          to,
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          title: params.title,
          body: params.body,
          data: {
            ...(typeof params.data === 'object' && params.data ? (params.data as any) : {}),
            type: params.type,
            notificationId: n.id,
          },
        })),
      );
      pushed++;
    } catch {
      // no cortamos por push
    }
  }

  return { ok: true, admins: admins.length, pushed };
}
