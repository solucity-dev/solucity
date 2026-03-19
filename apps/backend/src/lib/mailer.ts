// src/lib/mailer.ts
import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type StreamTransport from 'nodemailer/lib/stream-transport';

type MailerEnv = {
  RESEND_API_KEY?: string;

  /**
   * Puede venir como:
   * - "no-reply@solucity.app"
   * - "Solucity <no-reply@solucity.app>"
   */
  MAIL_FROM?: string;

  /**
   * Solo se usa si MAIL_FROM viene sin formato "Nombre <email>"
   * Ej: EMAIL_FROM_NAME="Solucity"
   */
  EMAIL_FROM_NAME?: string;

  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
};

const {
  RESEND_API_KEY,
  MAIL_FROM = 'no-reply@solucity.app',
  EMAIL_FROM_NAME = 'Solucity',
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
} = process.env as MailerEnv;

/**
 * Normaliza el "from" para que siempre salga con nombre.
 * - Si ya viene "Nombre <email>" lo respeta.
 * - Si viene solo el email, arma "Solucity <email>".
 */
const FROM = MAIL_FROM.includes('<') ? MAIL_FROM : `${EMAIL_FROM_NAME} <${MAIL_FROM}>`;

// ---------- RESEND ----------
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ---------- FALLBACK SMTP (real o fake) ----------
const hasSmtpCreds =
  Boolean(SMTP_HOST) && Boolean(SMTP_PORT) && Boolean(SMTP_USER) && Boolean(SMTP_PASS);

const transportOptions: SMTPTransport.Options | StreamTransport.Options = hasSmtpCreds
  ? {
      host: SMTP_HOST!,
      port: Number(SMTP_PORT!),
      secure: Number(SMTP_PORT!) === 465,
      auth: { user: SMTP_USER!, pass: SMTP_PASS! },
    }
  : {
      // SMTP "fake" para dev (no envía realmente, solo imprime en logs)
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    };

const transporter: Transporter = nodemailer.createTransport(transportOptions);

function buildProviderError(error: any) {
  const err: any = new Error(error?.message || 'email_send_failed');
  err.status = error?.statusCode ?? error?.status ?? 500;
  err.statusCode = error?.statusCode ?? error?.status ?? 500;
  err.name = error?.name || 'email_send_failed';
  err.provider = 'resend';
  err.raw = error;
  return err;
}

async function sendViaSmtp(to: string, subject: string, html: string) {
  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html,
  });

  if (!hasSmtpCreds) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📨 [FAKE SMTP] Email simulado ->', { to, subject });
    }
  } else {
    console.log('📨 Email enviado (SMTP):', info.messageId);
  }

  return { messageId: info.messageId, provider: hasSmtpCreds ? 'smtp' : 'fake-smtp' };
}

export async function sendOtpEmail(to: string, code: string) {
  const subject = 'Tu código de verificación';
  const html = `
    <div style="font-family:system-ui;padding:16px">
      <h2>Código de verificación</h2>
      <p>Usá este código para continuar:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</div>
      <p style="color:#666">Caduca en 10 minutos.</p>
    </div>
  `;

  // 1) Intentar con Resend si está configurado
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to,
        subject,
        html,
      });

      if (error) {
        console.error('[RESEND ERROR]', error);

        // Si hay SMTP real configurado, intentamos fallback
        if (hasSmtpCreds) {
          console.warn('[MAILER] Resend falló, intentando fallback SMTP...');
          return await sendViaSmtp(to, subject, html);
        }

        throw buildProviderError(error);
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('📨 Email enviado (Resend):', data?.id);
      }

      return { messageId: data?.id, provider: 'resend' };
    } catch (err: any) {
      console.error('[RESEND THROW]', err);

      // Fallback real a SMTP si existe
      if (hasSmtpCreds) {
        console.warn('[MAILER] Excepción en Resend, intentando fallback SMTP...');
        return await sendViaSmtp(to, subject, html);
      }

      // Preservar forma del error para que register.service.ts pueda mapearlo bien
      if (err?.provider === 'resend' || err?.status || err?.statusCode || err?.name) {
        throw err;
      }

      const unknown: any = new Error(err?.message || 'email_send_failed');
      unknown.status = 503;
      unknown.statusCode = 503;
      unknown.name = err?.name || 'email_delivery_unavailable';
      throw unknown;
    }
  }

  // 2) Si no hay Resend, usar SMTP real o fake
  return await sendViaSmtp(to, subject, html);
}
