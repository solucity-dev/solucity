import { createNotification } from './notificationService';
import { sendExpoPush } from './pushExpo';
import { prisma } from '../lib/prisma';

import type { BackgroundCheckStatus } from '@prisma/client';

export async function notifyBackgroundCheckStatus(params: {
  userId: string; // especialista (dueño del antecedente)
  status: BackgroundCheckStatus; // PENDING | APPROVED | REJECTED
  reason?: string | null;
  backgroundCheckId?: string | null;

  // extras
  alsoNotifyAdmins?: boolean; // para PENDING
}) {
  const { userId, status, reason, backgroundCheckId, alsoNotifyAdmins } = params;

  console.log(
    '[notifyBackgroundCheckStatus]',
    'userId=',
    userId,
    'status=',
    status,
    'backgroundCheckId=',
    backgroundCheckId,
    'time=',
    new Date().toISOString(),
  );

  // ✅ DEDUPE: no repetir misma combinación (backgroundCheckId + status)
  if (backgroundCheckId) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'BACKGROUND_CHECK_STATUS',
        AND: [
          { data: { path: ['backgroundCheckId'], equals: backgroundCheckId } },
          { data: { path: ['bgStatus'], equals: status } },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      console.log(
        '[notifyBackgroundCheckStatus] deduped -> already exists notificationId=',
        existing.id,
      );
      return { ok: true, notificationId: existing.id, deduped: true };
    }
  }

  const title =
    status === 'APPROVED'
      ? 'Antecedente aprobado ✅'
      : status === 'REJECTED'
        ? 'Antecedente rechazado ❌'
        : 'Antecedente en revisión';

  const body =
    status === 'APPROVED'
      ? 'Tu antecedente fue aprobado. Ya podés activarte como disponible.'
      : status === 'REJECTED'
        ? reason
          ? `Motivo: ${reason}`
          : 'Tu antecedente fue rechazado. Volvé a subirlo.'
        : 'Recibimos tu antecedente. Te avisaremos cuando esté aprobado.';

  // 1) DB notification (al especialista) - IMPORTANTÍSIMO: devuelve ID real
  const notif = await createNotification({
    userId,
    type: 'BACKGROUND_CHECK_STATUS',
    title,
    body,
    data: {
      type: 'BACKGROUND_CHECK_STATUS',
      bgStatus: status,
      reason: reason ?? null,
      backgroundCheckId: backgroundCheckId ?? null,
    },
  });

  // 2) push tokens del especialista
  const tokens = await prisma.pushToken.findMany({
    where: { userId, enabled: true },
    select: { token: true },
  });

  if (tokens.length > 0) {
    const messages = tokens
      .map((t) => t.token)
      .filter(Boolean)
      .map((to) => ({
        to,
        title,
        body,
        data: {
          notificationId: notif.id, // ✅ ID real de DB
          type: 'BACKGROUND_CHECK_STATUS',
          bgStatus: status,
          backgroundCheckId: backgroundCheckId ?? null,
        },
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
      }));

    try {
      await sendExpoPush(messages);
    } catch (e) {
      console.warn('[notifyBackgroundCheckStatus] sendExpoPush failed', e);
    }
  }

  // 3) (opcional) notificar admins cuando queda PENDING
  // ✅ FIX: NO usar createMany si querés IDs para mark-as-read.
  if (alsoNotifyAdmins && status === 'PENDING') {
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });

      for (const admin of admins) {
        // 3.1) DB notif admin (con ID)
        const adminNotif = await createNotification({
          userId: admin.id,
          type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
          title: 'Nuevo antecedente para revisar 🕵️',
          body: 'Un especialista subió su antecedente penal.',
          data: {
            type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
            backgroundCheckId: backgroundCheckId ?? null,
            specialistUserId: userId,
          },
        });

        // 3.2) push tokens admin (con notificationId real)
        const adminTokens = await prisma.pushToken.findMany({
          where: { userId: admin.id, enabled: true },
          select: { token: true },
        });

        const adminMsgs = adminTokens
          .map((t) => t.token)
          .filter(Boolean)
          .map((to) => ({
            to,
            title: 'Nuevo antecedente para revisar 🕵️',
            body: 'Un especialista subió su antecedente penal.',
            data: {
              notificationId: adminNotif.id, // ✅ ID real
              type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
              backgroundCheckId: backgroundCheckId ?? null,
              specialistUserId: userId,
            },
            sound: 'default' as const,
            priority: 'high' as const,
            channelId: 'default',
          }));

        if (adminMsgs.length > 0) {
          try {
            await sendExpoPush(adminMsgs);
          } catch (e) {
            console.warn('[notifyBackgroundCheckStatus] admin sendExpoPush failed', e);
          }
        }
      }
    } catch (e) {
      console.warn('[notifyBackgroundCheckStatus] notify admins failed', e);
    }
  }

  return { ok: true, notificationId: notif.id, deduped: false };
}
