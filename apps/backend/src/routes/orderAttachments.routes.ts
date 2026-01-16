import path from 'path';

import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { ensureDir, uploadsRoot } from '../lib/uploads';

export const orderAttachments = Router();

const uploadsDir = path.join(uploadsRoot, 'orders');
ensureDir(uploadsDir);

console.log('[orderAttachments] uploadsDir =', uploadsDir);

const upload = multer({ storage: multer.memoryStorage() });

orderAttachments.post('/orders/attachments/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'file_required' });

    const filename = `order-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
    const outPath = path.join(uploadsDir, filename);

    await sharp(req.file.buffer).resize(1200).webp({ quality: 80 }).toFile(outPath);

    // URL pública
    const url = `/uploads/orders/${filename}`;
    return res.json({ ok: true, url });
  } catch (e) {
    console.error('[orderAttachments] upload error', e);
    return res.status(500).json({ ok: false, error: 'upload_error' });
  }
});
