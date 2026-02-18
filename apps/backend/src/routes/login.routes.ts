//apps/backend/src/routes/login.routes.ts
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { dbg, debugOrders, errMsg } from '../utils/debug';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });
    const { email, password } = schema.parse(req.body);
    const normalized = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
        failedLoginCount: true,
      },
    });

    // ✅ respuesta genérica
    if (!user) return res.status(401).json({ ok: false, error: 'invalid_credentials' });

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ ok: false, error: 'blocked' });
    }

    // ✅ lockout simple por usuario (configurable)
    const maxFails = Number(process.env.LOGIN_MAX_FAILS ?? 10);
    if (Number.isFinite(maxFails) && user.failedLoginCount >= maxFails) {
      return res.status(429).json({ ok: false, error: 'too_many_attempts' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      // ✅ incrementa contador (sin filtrar info)
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    }

    // ✅ login ok: reset + lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lastLoginAt: new Date() },
    });

    const token = signToken({ sub: user.id, role: user.role as any });
    return res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    dbg(debugOrders, '[auth] POST /login error:', errMsg(err));
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
