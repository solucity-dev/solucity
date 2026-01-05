// apps/backend/src/services/register.service.ts
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addMinutes, isAfter } from 'date-fns';

import { sendOtpEmail } from '../lib/mailer';
import { generateOtp } from '../lib/otp';
import { prisma } from '../lib/prisma';

const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function httpError(message: string, status = 400) {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

export async function startEmailRegistration(email: string) {
  const normalized = email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: normalized } });
  if (exists) throw httpError('email_in_use', 409);

  const code = generateOtp();
  const expiresAt = addMinutes(new Date(), OTP_MINUTES);

  await prisma.emailOtp.create({ data: { email: normalized, code, expiresAt } });
  await sendOtpEmail(normalized, code);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔐 [DEV OTP] ${normalized} -> ${code} (expira ${expiresAt.toISOString()})`);
  }
  return { otpId: 'ok', expiresAt };
}

type VerifyArgs = {
  email: string;
  code: string;
  name: string;
  password: string;
  phone: string | null;
  role: 'CUSTOMER' | 'SPECIALIST';
};

export async function verifyEmailRegistration(args: VerifyArgs) {
  const email = args.email.trim().toLowerCase();
  const code = args.code.trim();

  // OTP checks
  const otp = await prisma.emailOtp.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
  if (!otp) throw httpError('otp_not_found', 400);
  if (otp.usedAt) throw httpError('otp_already_used', 400);
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw httpError('otp_blocked', 429);
  if (isAfter(new Date(), otp.expiresAt)) throw httpError('otp_expired', 400);
  if (otp.code !== code) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw httpError('otp_invalid', 400);
  }
  await prisma.emailOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

  // password
  if (!args.password || args.password.length < 8) throw httpError('weak_password', 400);

  // unicidad clara
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(args.phone ? [{ phone: args.phone }] : [])] },
    select: { email: true, phone: true },
  });
  if (existing?.email?.toLowerCase() === email) throw httpError('email_in_use', 409);
  if (args.phone && existing?.phone === args.phone) throw httpError('phone_in_use', 409);

  const passwordHash = await bcrypt.hash(args.password, 10);

  try {
    // Crear según role
    const user = await prisma.user.create({
      data: {
        email,
        phone: args.phone ?? null,
        name: args.name,
        passwordHash,
        role: args.role === 'SPECIALIST' ? 'SPECIALIST' : 'CUSTOMER',
        ...(args.role === 'SPECIALIST'
          ? { specialist: { create: {} } }
          : { customer: { create: {} } }),
      },
      select: { id: true, email: true, role: true },
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
