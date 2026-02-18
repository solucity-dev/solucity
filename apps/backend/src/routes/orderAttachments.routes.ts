//apps/backend/src/routes/orderAttachments.routes.ts
import path from 'path';

import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { ensureDir, uploadsRoot } from '../lib/uploads';
import { auth } from '../middlewares/auth';
import { dbg, debugUploads, errMsg } from '../utils/debug';

export const orderAttachments = Router();

const uploadsDir = path.join(uploadsRoot, 'orders');
ensureDir(uploadsDir);

dbg(debugUploads, '[orderAttachments] uploadsDir =', uploadsDir);

// ✅ límites + mime types permitidos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|webp)$/i.test(file.mimetype);
    if (!ok) return cb(new Error('unsupported_type'));
    cb(null, true);
  },
});

function multerErrorToResponse(err: any, res: any) {
  if (!err) return false;
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ ok: false, error: 'file_too_large' });
    return true;
  }
  if (err?.message === 'unsupported_type') {
    res.status(415).json({ ok: false, error: 'unsupported_type' });
    return true;
  }
  return false;
}

// ✅ protegido con auth
orderAttachments.post('/orders/attachments/upload', auth, (req, res) => {
  upload.single('file')(req, res, async (err: any) => {
    if (multerErrorToResponse(err, res)) return;

    try {
      if (!req.file) return res.status(400).json({ ok: false, error: 'file_required' });

      const filename = `order-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
      const outPath = path.join(uploadsDir, filename);

      await sharp(req.file.buffer).rotate().resize(1200).webp({ quality: 80 }).toFile(outPath);

      const url = `/uploads/orders/${filename}`;
      return res.json({ ok: true, url });
    } catch (e) {
      dbg(debugUploads, '[orderAttachments] upload error:', errMsg(e));
      return res.status(500).json({ ok: false, error: 'upload_error' });
    }
  });
});
