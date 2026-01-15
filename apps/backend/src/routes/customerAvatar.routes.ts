// apps/backend/src/routes/customerAvatar.routes.ts
import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import multer from 'multer';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';

const router = Router();

// Carpeta donde guardamos los avatares
const uploadsRoot = path.resolve(__dirname, '..', '..', 'uploads');
const uploadDir = path.join(uploadsRoot, 'avatars');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `customer-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post('/', auth, upload.single('avatar'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'missing_file' });
    }

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    // Buscamos el perfil del cliente por userId
    const customer = await (prisma as any).customerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'customer_profile_not_found' });
    }

    // Guardamos URL RELATIVA igual que specialist (el frontend la convierte con api.baseURL)
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const updated = await (prisma as any).customerProfile.update({
      where: { id: customer.id },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });

    return res.json({ ok: true, profile: updated });
  } catch (e) {
    console.error('[POST /customers/me/avatar]', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export { router as customerAvatarRouter };
