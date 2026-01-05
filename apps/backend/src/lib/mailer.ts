// apps/backend/src/lib/mailer.ts
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type StreamTransport from 'nodemailer/lib/stream-transport';

type MailerEnv = {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  MAIL_FROM?: string;
};

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM = 'no-reply@solucity.local',
} = process.env as MailerEnv;

// Detectamos si hay credenciales reales
const hasSmtpCreds =
  Boolean(SMTP_HOST) && Boolean(SMTP_PORT) && Boolean(SMTP_USER) && Boolean(SMTP_PASS);

// Elegimos config según haya o no SMTP real
const transportOptions: SMTPTransport.Options | StreamTransport.Options = hasSmtpCreds
  ? {
      host: SMTP_HOST!,
      port: Number(SMTP_PORT!),
      secure: Number(SMTP_PORT!) === 465,
      auth: { user: SMTP_USER!, pass: SMTP_PASS! },
    }
  : {
      // “stream transport”: no envía, genera el mensaje en memoria
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    };

const transporter: Transporter = nodemailer.createTransport(transportOptions);

export async function sendOtpEmail(to: string, code: string) {
  const subject = 'Tu código de verificación';
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:16px">
      <h2 style="margin:0 0 8px">Código de verificación</h2>
      <p>Usá este código para verificar tu correo en <b>Solucity</b>:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:4px;margin:12px 0">${code}</div>
      <p style="color:#666;margin-top:12px">Caduca en 10 minutos.</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });

  if (!hasSmtpCreds) {
    // Modo “fake”/stream: no se envía email, solo avisamos en consola
    console.log('📨 [FAKE SMTP] Email simulado ->', { to, subject });
  } else {
    console.log('📨 Email enviado:', info.messageId);
  }

  return { messageId: info.messageId };
}
