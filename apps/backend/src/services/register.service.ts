// apps/backend/src/services/register.service.ts

import crypto from 'crypto';

import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addMinutes, isAfter } from 'date-fns';

import { notifyAdmins } from './notificationService';
import { sendOtpEmail } from '../lib/mailer';
import { generateOtp } from '../lib/otp';
import { prisma } from '../lib/prisma';

const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function otpTraceEnabled(email: string) {
  // Activación general por env var
  if (process.env.DEBUG_OTP_FLOW === 'true') return true;

  // Activación limitada: solo para tus tests con alias +otp
  return email.includes('+otp');
}

function emailHash(email: string) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 10);
}

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

  const trace = otpTraceEnabled(normalized);
  const ehash = emailHash(normalized);
  if (trace) console.log(`[OTP/start] e=${ehash} begin`);

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

  if (trace) console.log(`[OTP/start] e=${ehash} sentCount=${sentCount}`);

  // 4) Invalidar OTPs previos no usados (evita múltiples OTP válidos a la vez)
  const invalidated = await prisma.emailOtp.updateMany({
    where: { email: normalized, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (trace) console.log(`[OTP/start] e=${ehash} invalidated=${invalidated.count}`);

  // 5) Generar y guardar OTP
  const code = generateOtp();
  const expiresAt = addMinutes(new Date(), OTP_MINUTES);

  const created = await prisma.emailOtp.create({
    data: { email: normalized, code, expiresAt },
  });
  if (trace)
    console.log(`[OTP/start] e=${ehash} createdId=${created.id} exp=${expiresAt.toISOString()}`);

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

  const trace = otpTraceEnabled(email);
  const ehash = emailHash(email);
  if (trace) console.log(`[OTP/verify] e=${ehash} begin codeLen=${code.length}`);

  const name = args.name.trim();
  const surname = args.surname?.trim();
  const phone = args.phone?.trim() || null;

  // OTP checks
  const otp = await prisma.emailOtp.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });

  if (trace) {
    console.log(
      `[OTP/verify] e=${ehash} pick id=${otp?.id ?? 'null'} created=${otp?.createdAt?.toISOString() ?? 'null'} usedAt=${otp?.usedAt?.toISOString() ?? 'null'} exp=${otp?.expiresAt?.toISOString() ?? 'null'} attempts=${otp?.attempts ?? 'null'}`,
    );
  }

  if (!otp) {
    if (trace) console.log(`[OTP/verify] e=${ehash} fail=otp_not_found`);
    throw httpError('otp_not_found', 400);
  }
  if (otp.usedAt) {
    if (trace) console.log(`[OTP/verify] e=${ehash} fail=otp_already_used`);
    throw httpError('otp_already_used', 400);
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    if (trace) console.log(`[OTP/verify] e=${ehash} fail=otp_blocked`);
    throw httpError('otp_blocked', 429);
  }
  if (isAfter(new Date(), otp.expiresAt)) {
    if (trace) console.log(`[OTP/verify] e=${ehash} fail=otp_expired`);
    throw httpError('otp_expired', 400);
  }

  if (otp.code !== code) {
    if (trace) {
      const safeGot = code ? `len=${code.length}` : 'len=0';
      console.log(
        `[OTP/verify] e=${ehash} fail=otp_invalid otpId=${otp.id} attempts=${otp.attempts} got(${safeGot})`,
      );
    }

    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    throw httpError('otp_invalid', 400);
  }

  // ✅ acá recién: otp match
  if (trace) console.log(`[OTP/verify] e=${ehash} otp_match id=${otp.id}`);

  const pwd = String(args.password ?? '');
  const hasMinLen = pwd.length >= 8;
  const hasLetter = /[A-Za-z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);

  if (!hasMinLen || !hasLetter || !hasNumber) {
    throw httpError('weak_password', 400);
  }

  // unicidad clara
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    select: { email: true, phone: true },
  });

  if (existing?.email?.toLowerCase() === email) throw httpError('email_in_use', 409);
  if (phone && existing?.phone === phone) throw httpError('phone_in_use', 409);

  const passwordHash = await bcrypt.hash(args.password, 10);

  try {
    if (trace) {
      console.log(
        `[OTP/verify] e=${ehash} creating_user role=${args.role} phone=${phone ? 'yes' : 'no'} surname=${surname ? 'yes' : 'no'}`,
      );
    }

    const now = new Date();

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
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

      // ✅ ahora sí: consumimos OTP SOLO si user se creó OK
      await tx.emailOtp.update({
        where: { id: otp.id },
        data: { usedAt: now },
      });

      if (trace) console.log(`[OTP/verify] e=${ehash} otp_used id=${otp.id}`);

      return createdUser;
    });

    if (trace) console.log(`[OTP/verify] e=${ehash} created_user id=${user.id} role=${user.role}`);

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
