import path from 'path';

import { Router } from 'express';
import multer from 'multer';

import { imageFileFilter } from '../lib/multerImage';
import { prisma } from '../lib/prisma';
import { ensureDir, resolveUploadsPath, safeUnlink, uploadsRoot } from '../lib/uploads';
import { auth } from '../middlewares/auth';
import { dbg, debugUploads, errMsg } from '../utils/debug';

const router = Router();

const uploadDir = path.join(uploadsRoot, 'avatars');
ensureDir(uploadDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const name = `specialist-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// POST /specialists/me/avatar
router.post('/me/avatar', auth, upload.single('avatar'), async (req, res) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'file_required' });

  try {
    const specialist = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true, avatarUrl: true },
    });

    if (!specialist) return res.status(400).json({ ok: false, error: 'not_specialist' });

    // ✅ borrar avatar anterior (best-effort)
    if (specialist.avatarUrl?.startsWith('/uploads/avatars/')) {
      const prevPath = resolveUploadsPath(uploadsRoot, specialist.avatarUrl);
      if (prevPath) {
        dbg(debugUploads, '[specialist avatar] removing previous', specialist.avatarUrl);
        safeUnlink(prevPath);
      }
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await prisma.specialistProfile.update({
      where: { id: specialist.id },
      data: { avatarUrl },
    });

    return res.status(201).json({ ok: true, avatarUrl });
  } catch (e) {
    dbg(debugUploads, '[POST /specialists/me/avatar] error', errMsg(e));
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
