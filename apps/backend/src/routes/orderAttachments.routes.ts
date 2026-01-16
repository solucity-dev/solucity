// apps/backend/src/routes/orderAttachments.routes.ts
import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';

export const orderAttachments = Router();

const uploadsRoot = path.join(process.cwd(), 'uploads'); // ✅ apps/backend/uploads
const uploadsDir = path.join(uploadsRoot, 'orders'); // ✅ apps/backend/uploads/orders
fs.mkdirSync(uploadsDir, { recursive: true });

console.log('[orderAttachments] uploadsDir =', uploadsDir);

const storage = multer.memoryStorage();
const upload = multer({ storage });

orderAttachments.post('/orders/attachments/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'file_required' });

    const filename = `order-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
    const outPath = path.join(uploadsDir, filename);

    await sharp(req.file.buffer).resize(1200).webp({ quality: 80 }).toFile(outPath);

    const url = `/uploads/orders/${filename}`;
    return res.json({ ok: true, url });
  } catch (e) {
    console.error('[orderAttachments] upload error', e);
    return res.status(500).json({ ok: false, error: 'upload_error' });
  }
});
