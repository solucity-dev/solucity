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

/**
 * Rate limit simple por email (sin Redis):
 * - Máx 3 códigos/solicitudes en 10 minutos por email
 */
const OTP_RATE_WINDOW_MINUTES = 10;
const OTP_RATE_MAX_PER_WINDOW = 3;

/**
 * Cooldown corto para evitar reenvíos impulsivos
 * y consumo innecesario de cuota del proveedor.
 */
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function otpTraceEnabled(email: string) {
  // Activación general por env var
  if (process.env.DEBUG_OTP_FLOW === 'true') return true;

  // Activación limitada: solo para tus tests con alias +otp
  return email.includes('+otp');
}

function emailHash(email: string) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 10);
}

function httpError(message: string, status = 400) {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

export async function startEmailRegistration(email: string) {
  const normalized = email.trim().toLowerCase();

  console.log('[REGISTER/SERVICE] start OTP flow for:', normalized);

  console.log('[REGISTER/SERVICE] email normalizado:', normalized);

  const trace = otpTraceEnabled(normalized);
  const ehash = emailHash(normalized);

  if (trace) console.log(`[OTP/start] e=${ehash} begin`);

  // 1) No permitir si ya existe usuario
  const exists = await prisma.user.findUnique({
    where: { email: normalized },
  });

  console.log('[REGISTER/SERVICE] usuario encontrado por email:', exists);

  if (exists) throw httpError('email_in_use', 409);

  const now = new Date();

  // 2) Limpieza de OTP expirados de ese email
  await prisma.emailOtp.deleteMany({
    where: {
      email: normalized,
      expiresAt: { lt: now },
    },
  });

  // 3) Rate limit por ventana de tiempo
  //    Sigue siendo simple y compatible con el esquema actual.
  const since = addMinutes(now, -OTP_RATE_WINDOW_MINUTES);
  const recentCount = await prisma.emailOtp.count({
    where: {
      email: normalized,
      createdAt: { gte: since },
    },
  });

  console.log('[REGISTER/SERVICE] recent OTP count:', recentCount);

  if (recentCount >= OTP_RATE_MAX_PER_WINDOW) {
    if (trace) {
      console.log(`[OTP/start] e=${ehash} fail=too_many_requests recentCount=${recentCount}`);
    }
    throw httpError('too_many_requests', 429);
  }

  if (trace) console.log(`[OTP/start] e=${ehash} recentCount=${recentCount}`);

  // 4) Buscar OTP activo, no usado y no expirado
  const activeOtp = await prisma.emailOtp.findFirst({
    where: {
      email: normalized,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(
    '[REGISTER/SERVICE] active OTP found:',
    activeOtp
      ? {
          id: activeOtp.id,
          createdAt: activeOtp.createdAt,
          expiresAt: activeOtp.expiresAt,
          usedAt: activeOtp.usedAt,
        }
      : null,
  );

  // 5) Cooldown corto: si ya existe OTP activo y fue creado hace menos de X segundos,
  //    bloqueamos el reenvío para no quemar cuota innecesariamente.
  if (activeOtp) {
    const secondsSinceCreation = Math.floor((now.getTime() - activeOtp.createdAt.getTime()) / 1000);

    if (secondsSinceCreation < OTP_RESEND_COOLDOWN_SECONDS) {
      if (trace) {
        console.log(
          `[OTP/start] e=${ehash} fail=too_many_requests cooldown_remaining=${
            OTP_RESEND_COOLDOWN_SECONDS - secondsSinceCreation
          }s`,
        );
      }
      throw httpError('too_many_requests', 429);
    }
  }

  let otpToUse: {
    id?: string;
    email: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
    usedAt: Date | null;
    attempts: number;
  } | null = null;

  let shouldCreateOtpInDb = false;

  // 6) Reutilizar OTP vigente si existe; si no, preparar uno nuevo.
  if (activeOtp) {
    otpToUse = {
      id: activeOtp.id,
      email: activeOtp.email,
      code: activeOtp.code,
      expiresAt: activeOtp.expiresAt,
      createdAt: activeOtp.createdAt,
      usedAt: activeOtp.usedAt,
      attempts: activeOtp.attempts,
    };

    if (trace) {
      console.log(
        `[OTP/start] e=${ehash} reusing_otp id=${activeOtp.id} exp=${activeOtp.expiresAt.toISOString()}`,
      );
    }
  } else {
    const code = generateOtp();
    const expiresAt = addMinutes(now, OTP_MINUTES);

    otpToUse = {
      email: normalized,
      code,
      expiresAt,
      createdAt: now,
      usedAt: null,
      attempts: 0,
    };

    shouldCreateOtpInDb = true;

    if (trace) {
      console.log(`[OTP/start] e=${ehash} prepared_new_otp exp=${expiresAt.toISOString()}`);
    }
  }

  // 7) Intentar enviar el mail ANTES de persistir cambios destructivos.
  //    Así evitamos crear OTP basura o invalidar OTP útil si el proveedor falla.
  try {
    console.log('[REGISTER/SERVICE] sending OTP email to:', normalized);

    await sendOtpEmail(normalized, otpToUse.code);

    console.log('[REGISTER/SERVICE] OTP email send OK to:', normalized);
  } catch (err: any) {
    console.log('[REGISTER/SERVICE] OTP email send FAILED:', {
      email: normalized,
      status: err?.status ?? err?.statusCode,
      name: err?.name,
      message: err?.message,
    });
    const resendStatus = err?.status ?? err?.statusCode;
    const resendName = err?.name ?? '';
    const resendMessage = err?.message ?? '';

    if (trace) {
      console.log(
        `[OTP/start] e=${ehash} send_failed status=${String(
          resendStatus ?? 'unknown',
        )} name=${String(resendName || 'unknown')} message=${String(resendMessage || 'unknown')}`,
      );
    }

    // Mapeo semántico para que la ruta pueda responder mejor al frontend.
    if (
      resendStatus === 429 &&
      (resendName === 'daily_quota_exceeded' || resendMessage.includes('daily email sending quota'))
    ) {
      throw httpError('email_provider_quota_exceeded', 429);
    }

    if (
      resendStatus === 429 &&
      (resendName === 'rate_limit_exceeded' || resendMessage.toLowerCase().includes('rate limit'))
    ) {
      throw httpError('email_provider_rate_limited', 429);
    }

    throw httpError('email_delivery_unavailable', 503);
  }

  // 8) Persistir SOLO si el envío fue exitoso.
  if (shouldCreateOtpInDb) {
    const created = await prisma.emailOtp.create({
      data: {
        email: normalized,
        code: otpToUse.code,
        expiresAt: otpToUse.expiresAt,
      },
    });

    console.log('[REGISTER/SERVICE] OTP persisted in DB for:', normalized);
    otpToUse = {
      id: created.id,
      email: created.email,
      code: created.code,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      usedAt: created.usedAt,
      attempts: created.attempts,
    };

    if (trace) {
      console.log(
        `[OTP/start] e=${ehash} createdId=${created.id} exp=${created.expiresAt.toISOString()}`,
      );
    }
  } else if (trace) {
    console.log(`[OTP/start] e=${ehash} reused_existing_otp send_ok`);
  }

  // 9) Log controlado
  const debugOtp = process.env.DEBUG_OTP === 'true';
  if (debugOtp || process.env.NODE_ENV !== 'production') {
    console.log(
      `🔐 [OTP] ${normalized} -> ${otpToUse.code} (expira ${otpToUse.expiresAt.toISOString()})`,
    );
  }

  return { otpId: 'ok', expiresAt: otpToUse.expiresAt };
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
  // ✅ Normalización consistente
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
      `[OTP/verify] e=${ehash} pick id=${otp?.id ?? 'null'} created=${
        otp?.createdAt?.toISOString() ?? 'null'
      } usedAt=${otp?.usedAt?.toISOString() ?? 'null'} exp=${
        otp?.expiresAt?.toISOString() ?? 'null'
      } attempts=${otp?.attempts ?? 'null'}`,
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
    where: { email },
    select: { email: true },
  });

  if (existing?.email?.toLowerCase() === email) throw httpError('email_in_use', 409);

  const passwordHash = await bcrypt.hash(args.password, 10);

  try {
    if (trace) {
      console.log(
        `[OTP/verify] e=${ehash} creating_user role=${args.role} phone=${
          phone ? 'yes' : 'no'
        } surname=${surname ? 'yes' : 'no'}`,
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
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          surname: true,
          phone: true,
        },
      });

      // Consumimos OTP solo si el user se creó correctamente
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
      throw httpError('unique_violation', 409);
    }
    throw e;
  }
}
