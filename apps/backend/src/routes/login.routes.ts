import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

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
      select: { id: true, email: true, role: true, status: true, passwordHash: true },
    });
    if (!user) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    if (user.status === 'BLOCKED') return res.status(403).json({ ok: false, error: 'blocked' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid_credentials' });

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
    if (process.env.NODE_ENV !== 'production') console.error('POST /auth/login', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
