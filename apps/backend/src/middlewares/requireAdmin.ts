import type { NextFunction, Request, Response } from 'express'

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user
  if (!user?.id) return res.status(401).json({ ok: false, error: 'unauthorized' })
  if (user.role !== 'ADMIN') return res.status(403).json({ ok: false, error: 'forbidden' })
  return next()
}
