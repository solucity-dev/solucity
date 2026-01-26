// apps/backend/src/routes/seed.routes.ts
import { Router } from 'express';

const router = Router();

const isProd = process.env.NODE_ENV === 'production';
const enabled = String(process.env.ENABLE_ADMIN_SEED ?? '').toLowerCase() === 'true';

// ✅ En PROD: ocultar completamente, salvo que ENABLE_ADMIN_SEED=true
router.use((req, res, next) => {
  if (isProd && !enabled) return res.status(404).end();
  return next();
});

// ✅ ping rápido (solo si está habilitado por el guard anterior)
router.get('/', (_req, res) => res.json({ ok: true, route: '/admin/seed' }));

router.post('/', async (req, res) => {
  const token = String(req.header('x-seed-token') ?? '').trim();
  const expected = String(process.env.SEED_TOKEN ?? '').trim();

  if (!expected) {
    return res.status(500).json({ ok: false, error: 'seed_token_not_configured' });
  }
  if (!token || token !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const { runSeed } = await import('../../prisma/seed.js');
  const result = await runSeed();
  return res.json({ ok: true, result });
});

export default router;
