// apps/backend/src/services/notificationEmailService.ts
import { Prisma } from '@prisma/client';

import { sendEmail } from './mailService';
import { prisma } from '../lib/prisma';

import type { NotificationType } from './notificationService';

type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
};

function escapeHtml(input: string) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EMAIL_NOTIFICATION_TYPES: NotificationType[] = [
  'ORDER_NEW_REQUEST',
  'ORDER_ACCEPTED_BY_SPECIALIST',
  'ORDER_REJECTED_BY_SPECIALIST',
  'ORDER_FINISHED',

  // ✅ tipos reales de órdenes en producción
  'ORDER_CREATED',
  'ORDER_ACCEPTED',
  'ORDER_FINISHED_BY_SPECIALIST',
  'ORDER_CONFIRMED_BY_CLIENT',
  'ORDER_CANCELLED_BY_CUSTOMER',
  'ORDER_CANCELLED_BY_SPECIALIST',
  'ORDER_CANCELLED_AUTO',

  'KYC_STATUS',
  'CERTIFICATION_APPROVED',
  'CERTIFICATION_REJECTED',
  'BACKGROUND_CHECK_STATUS',
  'BACKGROUND_CHECK_REVIEW_REQUEST',
  'SUBSCRIPTION_TRIAL_ENDING',
  'SUBSCRIPTION_TRIAL_ENDED',
  'SUBSCRIPTION_ACTIVE',
  'SUBSCRIPTION_PAST_DUE',

  'ACCOUNT_STATUS_CHANGED',
  'ADMIN_NEW_USER_REGISTERED',
  'ADMIN_SPECIALIST_SUBSCRIBED',
  'ADMIN_ORDER_CREATED',
  'SUBSCRIPTION_DAYS_GRANTED',
  'SUBSCRIPTION_STATUS_CHANGED',
];

function isNotificationType(value: string): value is NotificationType {
  return (EMAIL_NOTIFICATION_TYPES as string[]).includes(value);
}

function shouldSendEmailForNotification(type: string): type is NotificationType {
  return isNotificationType(type);
}

function getBaseWebUrl(): string {
  return (process.env.PUBLIC_WEB_URL || 'https://web.solucity.app').replace(/\/+$/, '');
}

function buildNotificationActionUrl(_notification: NotificationRecord): string {
  return getBaseWebUrl();
}

function buildEmailHtml(params: {
  userName?: string | null;
  title: string;
  body: string;
  actionUrl: string;
}) {
  const safeName = params.userName?.trim() ? escapeHtml(params.userName.trim()) : '';
  const safeTitle = escapeHtml(params.title);
  const safeBody = escapeHtml(params.body);
  const safeUrl = escapeHtml(params.actionUrl);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f9fb; padding:24px; color:#16343a;">
      <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e7eef1;">
        <div style="background:linear-gradient(135deg,#015A69,#16A4AE); padding:28px 24px; color:#ffffff;">
          <h1 style="margin:0; font-size:24px; line-height:1.2;">${safeTitle}</h1>
        </div>

        <div style="padding:24px;">
          <p style="margin-top:0; font-size:16px;">
            ${safeName ? `${safeName} 👋` : 'Hola 👋'}
          </p>

          <p style="font-size:15px; line-height:1.6; margin-bottom:18px;">
            ${safeBody}
          </p>

          <div style="margin:24px 0;">
            <a
              href="${safeUrl}"
              style="display:inline-block; background:#16A4AE; color:#ffffff; text-decoration:none; padding:14px 20px; border-radius:12px; font-weight:700;"
            >
              Ver en Solucity
            </a>
          </div>

          <p style="font-size:13px; color:#5f7a81; margin-bottom:8px;">
            Si el botón no funciona, abrí este enlace:
          </p>
          <p style="font-size:13px; color:#5f7a81; word-break:break-all;">
            ${safeUrl}
          </p>
        </div>
      </div>
    </div>
  `;
}

function buildEmailText(params: {
  userName?: string | null;
  title: string;
  body: string;
  actionUrl: string;
}) {
  const greeting = params.userName?.trim() ? `${params.userName.trim()} 👋` : 'Hola 👋';

  return `${greeting}

${params.title}

${params.body}

Abrir en Solucity:
${params.actionUrl}`;
}

export async function maybeSendNotificationEmail(notification: NotificationRecord) {
  console.log('[notification-email] maybeSendNotificationEmail called', {
    notificationId: notification.id,
    userId: notification.userId,
    type: notification.type,
  });
  if (!shouldSendEmailForNotification(notification.type)) {
    console.log('[notification-email] skipped by type', {
      notificationId: notification.id,
      type: notification.type,
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: notification.userId },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
    },
  });

  console.log('[notification-email] user loaded', {
    notificationId: notification.id,
    email: user?.email ?? null,
    status: user?.status ?? null,
  });

  if (!user?.email) {
    console.log('[notification-email] skipped: user without email', {
      notificationId: notification.id,
      userId: notification.userId,
    });
    return;
  }

  if (user.status !== 'ACTIVE') {
    console.log('[notification-email] skipped: user not active', {
      notificationId: notification.id,
      userId: notification.userId,
      status: user.status,
    });
    return;
  }

  const actionUrl = buildNotificationActionUrl(notification);

  console.log('[notification-email] sending email', {
    notificationId: notification.id,
    to: user.email,
    type: notification.type,
    actionUrl,
  });

  const emailResult = await sendEmail({
    to: user.email,
    subject: notification.title,
    html: buildEmailHtml({
      userName: user.name,
      title: notification.title,
      body: notification.body,
      actionUrl,
    }),
    text: buildEmailText({
      userName: user.name,
      title: notification.title,
      body: notification.body,
      actionUrl,
    }),
  });

  console.log('[notification-email] sendEmail result', {
    notificationId: notification.id,
    result: emailResult,
  });
}
