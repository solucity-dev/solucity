// apps/backend/scripts/sendAppUpdateEmail.ts
import { PrismaClient, UserStatus } from '@prisma/client';
import { Resend } from 'resend';

const prisma = new PrismaClient();

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Solucity <no-reply@solucity.app>';
const playStoreUrl =
  process.env.APP_PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.solucity.app';

const dryRun = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';
const onlyTestEmail = process.env.TEST_EMAIL?.trim().toLowerCase() || '';
const limit = Number(process.env.LIMIT || 0);
const offset = Number(process.env.OFFSET || 0);

if (!resendApiKey) {
  throw new Error('Falta RESEND_API_KEY en variables de entorno');
}

const resend = new Resend(resendApiKey);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(name?: string | null) {
  const safeName = name?.trim() ? escapeHtml(name.trim()) : '';

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f9fb; padding:24px; color:#16343a;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e7eef1;">
      <div style="background:linear-gradient(135deg,#015A69,#16A4AE); padding:28px 24px; color:#ffffff;">
        <h1 style="margin:0; font-size:24px; line-height:1.2;">
          Nueva versión disponible de Solucity
        </h1>
      </div>

      <div style="padding:24px;">
        <p style="margin-top:0; font-size:16px;">
          ${safeName ? `${safeName} 👋` : 'Hola 👋'}
        </p>

        <p style="font-size:15px; line-height:1.6; margin-bottom:16px;">
          Ya está disponible una nueva versión de <strong>Solucity</strong> con mejoras importantes en la app.
        </p>

        <ul style="font-size:15px; line-height:1.7; padding-left:20px; margin-bottom:18px;">
          <li>mejoras en la experiencia de uso</li>
          <li>nuevos servicios disponibles</li>
          <li>correcciones y optimizaciones generales</li>
          <li>mejoras en perfiles y visualización de trabajos realizados</li>
        </ul>

        <p style="font-size:15px; line-height:1.6; margin-bottom:18px;">
          Te recomendamos actualizar la aplicación desde Play Store para seguir usando Solucity correctamente y acceder a todas las mejoras.
        </p>

        <div style="margin:24px 0;">
          <a
            href="${playStoreUrl}"
            style="display:inline-block; background:#16A4AE; color:#ffffff; text-decoration:none; padding:14px 20px; border-radius:12px; font-weight:700;"
          >
            Actualizar desde Play Store
          </a>
        </div>

        <p style="font-size:15px; margin-bottom:0;">
          Gracias por seguir formando parte de Solucity 🚀
        </p>
      </div>
    </div>
  </div>
  `;
}

function buildText(name?: string | null) {
  const safeName = name?.trim() || '';
  const greeting = safeName ? `${safeName} 👋` : 'Hola 👋';

  return `${greeting}

Ya está disponible una nueva versión de Solucity con mejoras importantes en la app.

Esta actualización incluye:
- mejoras en la experiencia de uso
- nuevos servicios disponibles
- correcciones y optimizaciones generales
- mejoras en perfiles y visualización de trabajos realizados

Te recomendamos actualizar la aplicación desde Play Store para seguir usando Solucity correctamente y acceder a todas las mejoras.

Actualizar desde Play Store:
${playStoreUrl}

Gracias por seguir formando parte de Solucity 🚀`;
}

async function main() {
  console.log('📨 Buscando usuarios con email...');

  const users = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const deduped = new Map<string, { email: string; name: string | null }>();

  for (const user of users) {
    const email = String(user.email || '')
      .trim()
      .toLowerCase();

    if (!email || !isValidEmail(email)) continue;

    if (!deduped.has(email)) {
      deduped.set(email, {
        email,
        name: user.name ?? null,
      });
    }
  }

  let recipients: { email: string; name: string | null }[];

  if (onlyTestEmail) {
    recipients = [
      {
        email: onlyTestEmail,
        name: null,
      },
    ];
  } else {
    recipients = Array.from(deduped.values());
  }

  if (limit > 0) {
    recipients = recipients.slice(offset, offset + limit);
  } else if (offset > 0) {
    recipients = recipients.slice(offset);
  }

  console.log(`👥 Destinatarios únicos filtrados: ${recipients.length}`);
  console.log(`🧪 DRY_RUN=${dryRun}`);
  if (onlyTestEmail) console.log(`🎯 TEST_EMAIL=${onlyTestEmail}`);
  if (limit > 0) console.log(`🔢 LIMIT=${limit}`);
  if (offset > 0) console.log(`↪️ OFFSET=${offset}`);

  if (!recipients.length) {
    console.log('⚠️ No hay destinatarios para enviar.');
    return;
  }

  if (dryRun) {
    console.log('Primeros destinatarios:');
    console.log(recipients.slice(0, 10));
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: recipient.email,
        subject: 'Nueva versión disponible de Solucity',
        html: buildHtml(recipient.name),
        text: buildText(recipient.name),
      });

      console.log(`📨 Resend result for ${recipient.email}:`, result);

      sent += 1;
      console.log(`✅ Enviado a ${recipient.email}`);
    } catch (error) {
      failed += 1;
      console.error(`❌ Error enviando a ${recipient.email}`, error);
    }
  }

  console.log('---');
  console.log(`✅ Enviados: ${sent}`);
  console.log(`❌ Fallidos: ${failed}`);
}

main()
  .catch((error) => {
    console.error('❌ Error general del script', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
