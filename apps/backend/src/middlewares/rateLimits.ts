// apps/backend/src/middlewares/rateLimits.ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import type { Request } from 'express';

function getEmailFromBody(req: Request) {
  const email = typeof (req as any)?.body?.email === 'string' ? (req as any).body.email : '';
  return email.trim().toLowerCase();
}

// ✅ Key por IP (IPv4/IPv6 safe)
function keyByIp(req: Request) {
  // req.ip viene bien si tenés app.set('trust proxy', 1) (vos ya lo tenés)
  const rawIp = req.ip || req.socket?.remoteAddress || '';
  // En tu versión, ipKeyGenerator normaliza un string IP
  return ipKeyGenerator(rawIp);
}

function jsonRateLimit(error = 'rate_limited') {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error },
  };
}

/**
 * =========================
 * PASSWORD RESET – START
 * POST /auth/password/start
 * =========================
 */

// Por IP
export const passwordStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req: Request) => keyByIp(req),
  ...jsonRateLimit(),
});

// Por email
export const passwordStartEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req: Request) => {
    const email = getEmailFromBody(req);
    // si no hay email (body vacío), caemos a IP para evitar que todos compartan la misma key
    return email ? `pwd_start:${email}` : `pwd_start:ip:${keyByIp(req)}`;
  },
  ...jsonRateLimit(),
});

/**
 * =========================
 * PASSWORD RESET – VERIFY
 * POST /auth/password/verify
 * =========================
 */

// Por IP
export const passwordVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req: Request) => keyByIp(req),
  ...jsonRateLimit(),
});

// Por email
export const passwordVerifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => {
    const email = getEmailFromBody(req);
    return email ? `pwd_verify:${email}` : `pwd_verify:ip:${keyByIp(req)}`;
  },
  ...jsonRateLimit(),
});
