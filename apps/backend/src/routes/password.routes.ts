import { Router } from 'express';
import { z } from 'zod';

import { signToken } from '../lib/jwt';
import { startPasswordReset, verifyPasswordReset } from '../services/passwordReset.service';

const router = Router();

// POST /auth/password/start { email }
router.post('/password/start', async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);

    const result = await startPasswordReset(email);

    // siempre ok=true (no filtra si existe)
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const msg = err?.message ?? 'server_error';
    if (status !== 500) return res.status(status).json({ ok: false, error: msg });
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /auth/password/verify { email, code, newPassword }
router.post('/password/verify', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().min(4).max(8),
      newPassword: z.string().min(8),
    });
    const data = schema.parse(req.body);

    const user = await verifyPasswordReset({
      email: data.email,
      code: data.code,
      newPassword: data.newPassword,
    });

    // Opcional: devolver token para auto-login después del reset
    const token = signToken({ sub: user.id, role: user.role });

    return res.json({ ok: true, user, token });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const msg = err?.message ?? 'server_error';

    const otpErrors = new Set([
      'otp_not_found',
      'otp_already_used',
      'otp_blocked',
      'otp_expired',
      'otp_invalid',
    ]);
    if (otpErrors.has(msg)) return res.status(400).json({ ok: false, error: msg });

    if (msg === 'weak_password') return res.status(400).json({ ok: false, error: msg });
    if (msg === 'user_not_found') return res.status(404).json({ ok: false, error: msg });

    if (status !== 500) return res.status(status).json({ ok: false, error: msg });
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
