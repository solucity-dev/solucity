// apps/backend/src/services/mailService.ts
import { Resend } from 'resend';

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Solucity <no-reply@solucity.app>';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailSendingEnabled(): boolean {
  return String(process.env.NOTIFICATION_EMAILS_ENABLED || 'false').toLowerCase() === 'true';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendEmail(params: SendEmailParams) {
  console.log('[mailService] sendEmail called', {
    to: params.to,
    subject: params.subject,
    enabled: isEmailSendingEnabled(),
    fromEmail,
  });

  if (!isEmailSendingEnabled()) {
    console.log('[mailService] skipped: email disabled');
    return { ok: false, skipped: true, reason: 'email_disabled' as const };
  }

  if (!resend) {
    console.log('[mailService] missing RESEND_API_KEY');
    throw new Error('Falta RESEND_API_KEY en variables de entorno');
  }

  const to = String(params.to || '')
    .trim()
    .toLowerCase();

  if (!isValidEmail(to)) {
    console.log('[mailService] skipped: invalid email', { to });
    return { ok: false, skipped: true, reason: 'invalid_email' as const };
  }

  const result = await resend.emails.send({
    from: fromEmail,
    to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  console.log('[mailService] email sent result', result);

  return { ok: true, result };
}
