// apps/backend/src/middlewares/requiereAdmin.ts
import { type NextFunction, type Request, type Response } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
}
