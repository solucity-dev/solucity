// apps/backend/src/services/notifyKyc.ts
import type { VerificationStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { createNotification } from './notificationService';
import { sendExpoPush } from './pushExpo';

export async function notifyKycStatus(params: {
  userId: string;
  status: VerificationStatus; // UNVERIFIED | PENDING | VERIFIED | REJECTED
  reason?: string | null;
  submissionId?: string;
}) {
  const { userId, status, reason, submissionId } = params;

  console.log(
    '[notifyKycStatus]',
    'userId=',
    userId,
    'status=',
    status,
    'submissionId=',
    submissionId,
    'time=',
    new Date().toISOString(),
  );

  /**
   * ✅ DEDUPE CORRECTO:
   * Permitimos múltiples notificaciones para el mismo submissionId,
   * pero NO repetimos la MISMA combinación (submissionId + kycStatus).
   *
   * Ej:
   * - submissionId X + PENDING  (ok)
   * - submissionId X + VERIFIED (ok)
   * - submissionId X + VERIFIED (dedupe)
   */
  if (submissionId) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'KYC_STATUS',
        AND: [
          {
            data: {
              path: ['submissionId'],
              equals: submissionId,
            },
          },
          {
            data: {
              path: ['kycStatus'],
              equals: status,
            },
          },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      console.log('[notifyKycStatus] deduped -> already exists notificationId=', existing.id);
      return { ok: true, notificationId: existing.id, deduped: true };
    }
  }

  const title =
    status === 'VERIFIED'
      ? 'KYC aprobado ✅'
      : status === 'REJECTED'
        ? 'KYC rechazado ❌'
        : 'Cuenta en verificación';

  const body =
    status === 'VERIFIED'
      ? 'Tu cuenta ya está verificada. Ahora podés activarte como disponible.'
      : status === 'REJECTED'
        ? reason
          ? `No pudimos verificar tu identidad. Motivo: ${reason}`
          : 'No pudimos verificar tu identidad. Volvé a cargar el KYC.'
        : 'Estamos revisando tu identidad. Te avisaremos cuando esté aprobada.';

  // 1) DB notification
  const notif = await createNotification({
    userId,
    type: 'KYC_STATUS',
    title,
    body,
    data: {
      kycStatus: status,
      reason: reason ?? null,
      submissionId: submissionId ?? null,
    },
  });

  // 2) tokens
  const tokens = await prisma.pushToken.findMany({
    where: { userId, enabled: true },
    select: { token: true },
  });

  // 3) push (no rompe el flujo si falla)
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
          kycStatus: status,
          submissionId: submissionId ?? null,
        },
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
      }));

    try {
      await sendExpoPush(messages);
    } catch (e) {
      console.warn('[notifyKycStatus] sendExpoPush failed', e);
    }
  }

  return { ok: true, notificationId: notif.id, deduped: false };
}
