import { Router } from 'express';

const router = Router();

router.post('/seed', async (req, res) => {
  const token = String(req.header('x-seed-token') ?? '').trim();
  const expected = String(process.env.SEED_TOKEN ?? '').trim();

  if (!expected) {
    return res.status(500).json({ ok: false, error: 'seed_token_not_configured' });
  }

  if (!token || token !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    // 👇 IMPORTANTE: extensión .js por NodeNext / dist
    const { runSeed } = await import('../../prisma/seed.js');
    const result = await runSeed();
    return res.json({ ok: true, result });
  } catch (e) {
    console.error('[seed] error', e);
    return res.status(500).json({ ok: false, error: 'seed_failed' });
  }
});

export default router;
