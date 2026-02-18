// apps/backend/src/routes/profile.routes.ts
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';
import { dbg, debugNotifications, errMsg } from '../utils/debug';

const router = Router();

/* ─────────── PATCH /auth/profile (nombre, apellido, teléfono) ─────────── */

const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  surname: z.string().min(1).max(80).optional(),
  phone: z.string().min(6).max(30).optional(),
  // email NO se toca desde acá
});

router.patch('/profile', auth, async (req, res) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const data = parsed.data;
  if (!data.name && !data.surname && !data.phone) {
    return res.status(400).json({ ok: false, error: 'no_fields_to_update' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.surname !== undefined ? { surname: data.surname } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        phone: true,
        role: true,
      },
    });

    return res.json({ ok: true, user });
  } catch (e) {
    dbg(debugNotifications, '[PATCH /auth/profile] error:', errMsg(e));

    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* ─────────── PATCH /auth/password (cambiar contraseña) ─────────── */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(100),
  newPassword: z.string().min(6).max(100),
});

router.patch('/password', auth, async (req, res) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'invalid_current_password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // 🔐 invalidar todas las sesiones activas (refresh tokens)
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return res.json({ ok: true });
  } catch (e) {
    dbg(debugNotifications, '[PATCH /auth/password] error:', errMsg(e));

    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export const profileRoutes = router;
