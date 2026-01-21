//apps/backend/src/services/notificationService.ts
import { Prisma } from '@prisma/client';

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
  | 'SUBSCRIPTION_DAYS_GRANTED';

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
