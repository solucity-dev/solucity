//apps/backend/src/routes/customersMe.routes.ts
import { Router } from 'express';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';

const router = Router();

// GET /customers/me
router.get('/me', auth, async (req: any, res) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const profile = await (prisma as any).customerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        avatarUrl: true,
        // si tenés otros campos en tu modelo, podés agregarlos luego:
        // phone: true,
        // address: true,
      },
    });

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'customer_profile_not_found' });
    }

    return res.json({ ok: true, profile });
  } catch (e) {
    console.error('[GET /customers/me] error', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
