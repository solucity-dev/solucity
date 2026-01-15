// apps/backend/src/routes/specialistAvatar.routes.ts
import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import multer from 'multer';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';

const router = Router();

// Carpeta de uploads/avatars
const uploadsRoot = path.resolve(__dirname, '..', '..', 'uploads');
const uploadDir = path.join(uploadsRoot, 'avatars');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || '.jpg'}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// POST /specialists/me/avatar
router.post('/me/avatar', auth, upload.single('avatar'), async (req, res) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'file_required' });
  }

  try {
    const specialist = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!specialist) {
      return res.status(400).json({ ok: false, error: 'not_specialist' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await prisma.specialistProfile.update({
      where: { id: specialist.id },
      data: { avatarUrl },
    });

    return res.status(201).json({ ok: true, avatarUrl });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[POST /specialists/me/avatar] error', e);
    }
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
