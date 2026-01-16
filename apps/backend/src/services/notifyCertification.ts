//apps/backend/src/services/notifyCertification.ts
import { createNotification } from './notificationService';
import { sendExpoPush } from './pushExpo';
import { prisma } from '../lib/prisma';

import type { CertStatus } from '@prisma/client';

export async function notifyCertificationStatus(params: {
  userId: string;
  status: CertStatus; // PENDING | APPROVED | REJECTED
  certificationId: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  reason?: string | null;
}) {
  const { userId, status, certificationId, categorySlug, categoryName, reason } = params;

  // Por ahora NO notificamos PENDING para no romper tipos ni ensuciar la DB.
  if (status === 'PENDING') {
    return { ok: true, skipped: true };
  }

  const title = status === 'APPROVED' ? 'Certificación aprobada ✅' : 'Certificación rechazada ❌';

  const prefix = categoryName ? `(${categoryName}) ` : '';

  const body =
    status === 'APPROVED'
      ? `${prefix}Tu documento fue aprobado.`
      : reason
        ? `${prefix}Motivo: ${reason}`
        : `${prefix}No pudimos validar el documento. Volvé a subirlo.`;

  // ✅ Estos types tienen que existir en tu enum NotificationType (Prisma).
  const notifType = status === 'APPROVED' ? 'CERTIFICATION_APPROVED' : 'CERTIFICATION_REJECTED';

  // 1) DB notification
  const notif = await createNotification({
    userId,
    type: notifType,
    title,
    body,
    data: {
      certificationId,
      status,
      categorySlug: categorySlug ?? null,
      categoryName: categoryName ?? null,
      reason: reason ?? null,
    },
  });

  // 2) tokens
  const tokens = await prisma.pushToken.findMany({
    where: { userId, enabled: true },
    select: { token: true },
  });

  // 3) push
  const toList = tokens.map((t) => t.token).filter(Boolean);
  if (toList.length > 0) {
    await sendExpoPush(
      toList.map((to) => ({
        to,
        title,
        body,
        data: {
          notificationId: notif.id,
          certificationId,
          status,
        },
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
      })),
    );
  }

  return { ok: true, notificationId: notif.id };
}
