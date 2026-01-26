import path from 'path';

import { Router } from 'express';
import multer from 'multer';

import { imageFileFilter } from '../lib/multerImage';
import { prisma } from '../lib/prisma';
import { ensureDir, resolveUploadsPath, safeUnlink, uploadsRoot } from '../lib/uploads';
import { auth } from '../middlewares/auth';

const router = Router();

// ✅ uploads/avatars dentro del root unificado
const uploadDir = path.join(uploadsRoot, 'avatars');
ensureDir(uploadDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `customer-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/', auth, upload.single('avatar'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'missing_file' });

    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const customer = await prisma.customerProfile.findUnique({
      where: { userId },
      select: { id: true, avatarUrl: true },
    });

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'customer_profile_not_found' });
    }

    // ✅ borrar avatar anterior (best-effort)
    if (customer.avatarUrl?.startsWith('/uploads/avatars/')) {
      const prevPath = resolveUploadsPath(uploadsRoot, customer.avatarUrl);
      if (prevPath) safeUnlink(prevPath);
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const updated = await prisma.customerProfile.update({
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
