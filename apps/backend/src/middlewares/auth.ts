// apps/backend/src/middlewares/auth.ts
import { type NextFunction, type Request, type Response } from 'express';

import { verifyToken } from '../lib/jwt';

export function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });

  try {
    const payload = verifyToken(token); // throws si es inválido
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
}
