// apps/backend/src/routes/register.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { signToken } from '../lib/jwt';
import { startEmailRegistration, verifyEmailRegistration } from '../services/register.service';

const router = Router();

/**
 * Helpers
 */
function zodDetails(err: any) {
  // Para devolver detalles útiles si querés debuggear (sin romper el contrato)
  // (en prod podrías omitir `details` si preferís)
  if (err?.name === 'ZodError' && Array.isArray(err?.issues)) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of err.issues) {
      const key = (i.path?.[0] as string) ?? 'form';
      fieldErrors[key] = fieldErrors[key] ?? [];
      fieldErrors[key].push(i.message);
    }
    return { fieldErrors, formErrors: [] as string[] };
  }
  return undefined;
}

/**
 * POST /auth/register/start
 * body: { email }
 */
router.post('/register/start', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
    });

    const { email } = schema.parse(req.body);

    const result = await startEmailRegistration(email);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const msg = err?.message ?? 'server_error';

    // Validación input (Zod)
    if (err?.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: zodDetails(err) });
    }

    // Errores conocidos
    if (msg === 'email_in_use') {
      return res.status(409).json({ ok: false, error: 'email_in_use' });
    }

    // ✅ NUEVO: rate limit por email
    if (msg === 'too_many_requests') {
      return res.status(429).json({ ok: false, error: 'too_many_requests' });
    }

    // Respeta status custom si vino del servicio
    if (status !== 500) {
      return res.status(status).json({ ok: false, error: msg });
    }

    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /auth/register/verify
 * body: { email, code, name, password, phone?, role?, surname? }
 *
 * Nota: hacemos el code exactamente de 6 dígitos.
 */
router.post('/register/verify', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      // ✅ 6 dígitos exactos
      code: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
      name: z.string().min(2),
      password: z.string().min(8),
      phone: z.string().min(6).max(25).optional().nullable(),
      role: z.enum(['CUSTOMER', 'SPECIALIST']).default('CUSTOMER'),
      // opcional: surname si lo usás
      surname: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const user = await verifyEmailRegistration({
      email: data.email,
      code: data.code,
      name: data.name,
      password: data.password,
      phone: data.phone ?? null,
      role: data.role,
    });

    const token = signToken({ sub: user.id, role: user.role });
    return res.json({ ok: true, user, token });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const msg = err?.message ?? 'server_error';

    // Validación input (Zod)
    if (err?.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: zodDetails(err) });
    }

    // Errores OTP => 400/429
    const otpErrors400 = new Set([
      'otp_not_found',
      'otp_already_used',
      'otp_expired',
      'otp_invalid',
    ]);
    if (otpErrors400.has(msg)) return res.status(400).json({ ok: false, error: msg });

    // otp_blocked viene con 429 desde el servicio
    if (msg === 'otp_blocked') return res.status(429).json({ ok: false, error: 'otp_blocked' });

    // Conflictos únicos => 409
    const conflicts = new Set(['email_in_use', 'phone_in_use', 'unique_violation']);
    if (conflicts.has(msg)) return res.status(409).json({ ok: false, error: msg });

    // Errores de validación de negocio => 400
    const badRequests = new Set(['weak_password']);
    if (badRequests.has(msg)) return res.status(400).json({ ok: false, error: msg });

    // Si el servicio definió status no-500, respétalo
    if (status !== 500) return res.status(status).json({ ok: false, error: msg });

    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
