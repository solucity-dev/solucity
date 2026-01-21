// apps/backend/src/services/notifyBackgroundCheck.ts
import { createNotification } from './notificationService';
import { sendExpoPush } from './pushExpo';
import { prisma } from '../lib/prisma';

import type { BackgroundCheckStatus } from '@prisma/client';

export async function notifyBackgroundCheckStatus(params: {
  userId: string;
  status: BackgroundCheckStatus; // PENDING | APPROVED | REJECTED
  reason?: string | null;
  backgroundCheckId?: string | null;

  // ✅ NUEVO: clave para dedupe por “versión” (archivo)
  fileUrl?: string | null;

  // extras
  alsoNotifyAdmins?: boolean; // para PENDING
}) {
  const { userId, status, reason, backgroundCheckId, fileUrl, alsoNotifyAdmins } = params;

  console.log(
    '[notifyBackgroundCheckStatus]',
    'userId=',
    userId,
    'status=',
    status,
    'backgroundCheckId=',
    backgroundCheckId,
    'fileUrl=',
    fileUrl,
    'time=',
    new Date().toISOString(),
  );

  // ✅ DEDUPE MEJORADO:
  // No repetir misma combinación (backgroundCheckId + status + fileUrl)
  // Así: si el especialista re-sube otro archivo, vuelve a notificar.
  if (backgroundCheckId) {
    const and: any[] = [
      { data: { path: ['backgroundCheckId'], equals: backgroundCheckId } },
      { data: { path: ['bgStatus'], equals: status } },
    ];

    // si viene fileUrl, también es parte de la “versión”
    if (fileUrl) {
      and.push({ data: { path: ['fileUrl'], equals: fileUrl } });
    }

    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'BACKGROUND_CHECK_STATUS',
        AND: and,
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

  // 1) DB notification (especialista)
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
      fileUrl: fileUrl ?? null, // ✅ guardar para dedupe correcto
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
          notificationId: notif.id,
          type: 'BACKGROUND_CHECK_STATUS',
          bgStatus: status,
          backgroundCheckId: backgroundCheckId ?? null,
          fileUrl: fileUrl ?? null,
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

  // 3) admins cuando queda PENDING
  if (alsoNotifyAdmins && status === 'PENDING') {
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });

      for (const admin of admins) {
        const adminNotif = await createNotification({
          userId: admin.id,
          type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
          title: 'Nuevo antecedente para revisar 🕵️',
          body: 'Un especialista subió su antecedente penal.',
          data: {
            type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
            backgroundCheckId: backgroundCheckId ?? null,
            specialistUserId: userId,
            fileUrl: fileUrl ?? null,
          },
        });

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
              notificationId: adminNotif.id,
              type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
              backgroundCheckId: backgroundCheckId ?? null,
              specialistUserId: userId,
              fileUrl: fileUrl ?? null,
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
