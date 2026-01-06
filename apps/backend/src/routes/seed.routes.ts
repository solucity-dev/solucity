import { Router } from 'express';

const router = Router();

/**
 * POST /admin/seed
 * Protegido por SEED_TOKEN (header: x-seed-token)
 * NO requiere JWT
 */
router.post('/admin/seed', async (req, res) => {
  try {
    const token = String(req.header('x-seed-token') ?? '').trim();
    const expected = String(process.env.SEED_TOKEN ?? '').trim();

    if (!expected) {
      return res.status(500).json({ ok: false, error: 'seed_token_not_configured' });
    }

    if (!token || token !== expected) {
      return res.status(401).json({ ok: false, error: 'invalid_seed_token' });
    }

    const { runSeed } = await import('../../prisma/seed.js');

    const result = await runSeed();
    return res.json({ ok: true, result });
  } catch (e) {
    console.error('[seed] error', e);
    return res.status(500).json({ ok: false, error: 'seed_failed' });
  }
});

export default router;
