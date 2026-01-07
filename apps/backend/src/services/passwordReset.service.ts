//apps/backend/src/services/passwordReset.service.ts
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

/**
 * POST /auth/password/start { email }
 * - No revela si el email existe: siempre responde ok=true
 * - Pero internamente solo crea OTP si el user existe
 */
export async function startPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true },
  });

  // Para no filtrar existencia del email: siempre respondemos ok.
  if (!user) {
    return { otpId: 'ok', expiresAt: addMinutes(new Date(), OTP_MINUTES) };
  }

  const code = generateOtp();
  const expiresAt = addMinutes(new Date(), OTP_MINUTES);

  await prisma.emailOtp.create({
    data: { email: normalized, code, expiresAt },
  });

  await sendOtpEmail(normalized, code);

  const debugOtp = process.env.DEBUG_OTP === 'true';
  if (debugOtp || process.env.NODE_ENV !== 'production') {
    console.log(`🔐 [RESET OTP] ${normalized} -> ${code} (expira ${expiresAt.toISOString()})`);
  }

  return { otpId: 'ok', expiresAt };
}

type VerifyResetArgs = {
  email: string;
  code: string;
  newPassword: string;
};

export async function verifyPasswordReset(args: VerifyResetArgs) {
  const email = args.email.trim().toLowerCase();
  const code = args.code.trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, email: true },
  });
  if (!user) throw httpError('user_not_found', 404);

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

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  // password
  const newPassword = args.newPassword?.trim() ?? '';
  if (newPassword.length < 8) throw httpError('weak_password', 400);

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // ✅ Recomendado: invalidar refresh tokens (si los usás)
  // Si tu modelo se llama RefreshToken y tiene userId:
  // await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  return { id: user.id, email: user.email, role: user.role };
}
