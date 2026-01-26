// apps/backend/src/middlewares/auth.ts
import { type NextFunction, type Request, type Response } from 'express';

import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export async function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const payload = verifyToken(token);

    if (!payload?.sub) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ ok: false, error: 'user_blocked' });
    }

    req.user = { id: user.id, role: user.role };
    return next();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] invalid token', err);
    }
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
}
