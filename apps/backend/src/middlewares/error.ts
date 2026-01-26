// apps/backend/src/middlewares/error.ts
import type { NextFunction, Request, Response } from 'express';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ ok: false, error: 'not_found' });
}

type AnyErr = {
  status?: number;
  code?: string;
  message?: unknown;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = (typeof err === 'object' && err !== null ? (err as AnyErr) : {}) as AnyErr;

  const status = Number(e.status) || 500;
  const code = e.code || (status === 500 ? 'internal_error' : 'error');

  const message =
    typeof e.message === 'string'
      ? e.message
      : process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : String(err);

  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', err);
  }

  // En prod devolvemos solo code (y opcional message genérico)
  if (process.env.NODE_ENV === 'production') {
    return res.status(status).json({ ok: false, error: code });
  }

  // En dev devolvemos detalles
  return res.status(status).json({ ok: false, error: code, message });
}
