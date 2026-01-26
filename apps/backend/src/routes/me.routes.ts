// apps/backend/src/routes/me.routes.ts
import { Router } from 'express';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';

const router = Router();

router.get('/me', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const base = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        surname: true,
        phone: true,
        customer: {
          select: {
            id: true,
            defaultAddress: { select: { id: true, formatted: true } },
          },
        },
        specialist: { select: { id: true } },
      },
    });
    if (!base) return res.status(404).json({ ok: false, error: 'not_found' });

    return res.json({
      ok: true,
      user: {
        id: base.id,
        email: base.email,
        role: base.role,
        name: base.name,
        surname: base.surname,
        phone: base.phone,
      },
      profiles: {
        customerId: base.customer?.id ?? null,
        specialistId: base.specialist?.id ?? null,
      },
      defaultAddress: base.customer?.defaultAddress ?? null,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /auth/me', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
