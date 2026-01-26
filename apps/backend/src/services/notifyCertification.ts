// apps/backend/src/services/notifyCertification.ts
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

  if (process.env.NODE_ENV !== 'production') {
    console.log('[notifyCertificationStatus]', {
      userId,
      status,
      certificationId,
      categorySlug,
      time: new Date().toISOString(),
    });
  }

  // Por ahora NO notificamos PENDING para no ensuciar ni spamear.
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

  // ✅ Estos types deben existir en NotificationType (TS union en notificationService.ts)
  const notifType = status === 'APPROVED' ? 'CERTIFICATION_APPROVED' : 'CERTIFICATION_REJECTED';

  // ✅ DEDUPE: no repetir misma combinación (certificationId + status)
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: notifType,
      AND: [
        { data: { path: ['certificationId'], equals: certificationId } },
        { data: { path: ['status'], equals: status } },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifyCertificationStatus] deduped -> notificationId=', existing.id);
    }
    return { ok: true, notificationId: existing.id, deduped: true };
  }

  // 1) DB notification
  const notif = await createNotification({
    userId,
    type: notifType,
    title,
    body,
    data: {
      type: notifType,
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

  const toList = tokens.map((t) => t.token).filter(Boolean);

  if (!toList.length) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[notifyCertificationStatus] no tokens -> dbOnly notificationId=', notif.id);
    }
    return { ok: true, notificationId: notif.id, pushed: false };
  }

  // 3) push (no rompe el flujo si falla)
  try {
    await sendExpoPush(
      toList.map((to) => ({
        to,
        title,
        body,
        data: {
          notificationId: notif.id,
          type: notifType,
          certificationId,
          status,
          categorySlug: categorySlug ?? null,
        },
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
      })),
    );
  } catch (e) {
    console.warn('[notifyCertificationStatus] sendExpoPush failed', e);
    return { ok: true, notificationId: notif.id, pushed: false };
  }

  return { ok: true, notificationId: notif.id, pushed: true, deduped: false };
}
