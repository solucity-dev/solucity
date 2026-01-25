// apps/backend/src/services/register.service.ts
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addMinutes, isAfter } from 'date-fns';

import { notifyAdmins } from './notificationService';
import { sendOtpEmail } from '../lib/mailer';
import { generateOtp } from '../lib/otp';
import { prisma } from '../lib/prisma';

const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Rate limit simple por email (sin Redis):
 * - Máx 3 códigos en 10 minutos por email
 */
const OTP_RATE_WINDOW_MINUTES = 10;
const OTP_RATE_MAX_PER_WINDOW = 3;

function httpError(message: string, status = 400) {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

export async function startEmailRegistration(email: string) {
  const normalized = email.trim().toLowerCase();

  // 1) No permitir si ya existe usuario
  const exists = await prisma.user.findUnique({ where: { email: normalized } });
  if (exists) throw httpError('email_in_use', 409);

  // 2) Limpieza de OTP expirados de ese email (higiene)
  await prisma.emailOtp.deleteMany({
    where: { email: normalized, expiresAt: { lt: new Date() } },
  });

  // 3) Rate limit por email (cuántos OTP emití en los últimos X minutos)
  const since = addMinutes(new Date(), -OTP_RATE_WINDOW_MINUTES);
  const sentCount = await prisma.emailOtp.count({
    where: { email: normalized, createdAt: { gte: since } },
  });
  if (sentCount >= OTP_RATE_MAX_PER_WINDOW) {
    throw httpError('too_many_requests', 429);
  }

  // 4) Invalidar OTPs previos no usados (evita múltiples OTP válidos a la vez)
  await prisma.emailOtp.updateMany({
    where: { email: normalized, usedAt: null },
    data: { usedAt: new Date() },
  });

  // 5) Generar y guardar OTP
  const code = generateOtp();
  const expiresAt = addMinutes(new Date(), OTP_MINUTES);

  await prisma.emailOtp.create({
    data: { email: normalized, code, expiresAt },
  });

  // 6) Enviar email (SMTP real si hay credenciales, fake si no)
  await sendOtpEmail(normalized, code);

  // 7) Log controlado (Render)
  const debugOtp = process.env.DEBUG_OTP === 'true';
  if (debugOtp || process.env.NODE_ENV !== 'production') {
    console.log(`🔐 [OTP] ${normalized} -> ${code} (expira ${expiresAt.toISOString()})`);
  }

  return { otpId: 'ok', expiresAt };
}

type VerifyArgs = {
  email: string;
  code: string;
  name: string;
  surname?: string;
  password: string;
  phone: string | null;
  role: 'CUSTOMER' | 'SPECIALIST';
};

export async function verifyEmailRegistration(args: VerifyArgs) {
  // ✅ Normalización consistente (IMPORTANTE)
  const email = args.email.trim().toLowerCase();
  const code = args.code.trim();

  const name = args.name.trim();
  const surname = args.surname?.trim();
  const phone = args.phone?.trim() || null;

  // OTP checks
  const otp = await prisma.emailOtp.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) throw httpError('otp_not_found', 400);
  if (otp.usedAt) throw httpError('otp_already_used', 400);
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw httpError('otp_blocked', 429);
  if (isAfter(new Date(), otp.expiresAt)) throw httpError('otp_expired', 400);

  if (otp.code !== code) {
    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw httpError('otp_invalid', 400);
  }

  // Marcar OTP como usado
  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  // password
  if (!args.password || args.password.length < 8) throw httpError('weak_password', 400);

  // unicidad clara
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    select: { email: true, phone: true },
  });

  if (existing?.email?.toLowerCase() === email) throw httpError('email_in_use', 409);
  if (phone && existing?.phone === phone) throw httpError('phone_in_use', 409);

  const passwordHash = await bcrypt.hash(args.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        name,
        surname: surname ? surname : null,
        passwordHash,
        role: args.role === 'SPECIALIST' ? 'SPECIALIST' : 'CUSTOMER',
        ...(args.role === 'SPECIALIST'
          ? { specialist: { create: {} } }
          : { customer: { create: {} } }),
      },
      select: { id: true, email: true, role: true, name: true, surname: true, phone: true },
    });
    await notifyAdmins({
      type: 'ADMIN_NEW_USER_REGISTERED',
      title: 'Nuevo usuario registrado',
      body: `${user.role}: ${user.email}`,
      data: {
        userId: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
        surname: user.surname,
        phone: user.phone,
        createdAt: new Date().toISOString(),
      },
    });

    return user;
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const fields = (e.meta?.target as string[]) ?? [];
      if (fields.includes('email')) throw httpError('email_in_use', 409);
      if (fields.includes('phone')) throw httpError('phone_in_use', 409);
      throw httpError('unique_violation', 409);
    }
    throw e;
  }
}
