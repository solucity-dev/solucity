// apps/backend/src/routes/seed.routes.ts
import { Router } from 'express';

const router = Router();

// ✅ ping rápido para probar en navegador
router.get('/seed', (_req, res) => res.json({ ok: true, route: '/admin/seed' }));

router.post('/seed', async (req, res) => {
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
