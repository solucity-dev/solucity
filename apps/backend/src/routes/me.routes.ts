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
      select: { id: true, email: true, role: true, name: true, surname: true, phone: true },
    });
    if (!base) return res.status(404).json({ ok: false, error: 'not_found' });

    const customer = await prisma.customerProfile.findUnique({
      where: { userId: base.id },
      select: { id: true, defaultAddressId: true },
    });
    const specialist = await prisma.specialistProfile.findUnique({
      where: { userId: base.id },
      select: { id: true },
    });
    let defaultAddress: { id: string; formatted: string } | null = null;
    if (customer?.defaultAddressId) {
      const addr = await prisma.address.findUnique({
        where: { id: customer.defaultAddressId },
        select: { id: true, formatted: true },
      });
      if (addr) defaultAddress = addr;
    }

    return res.json({
      ok: true,
      user: base,
      profiles: {
        customerId: customer?.id ?? null,
        specialistId: specialist?.id ?? null,
      },
      defaultAddress,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /auth/me', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
