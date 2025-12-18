// apps/backend/src/routes/orderAttachments.routes.ts
import { Router } from 'express'
import fs from 'fs'
import multer from 'multer'
import path from 'path'
import sharp from 'sharp'

export const orderAttachments = Router()

/**
 * ✅ IMPORTANTÍSIMO:
 * - __dirname acá = apps/backend/src/routes
 * - Queremos guardar en apps/backend/uploads/orders
 * - Eso coincide con el static que montaste en server.ts
 */
const uploadsRoot = path.resolve(__dirname, '..', '..', 'uploads') // apps/backend/uploads
const uploadsDir = path.join(uploadsRoot, 'orders')
fs.mkdirSync(uploadsDir, { recursive: true })

// (Opcional) log para verificar ruta real
console.log('[orderAttachments] uploadsDir =', uploadsDir)

const storage = multer.memoryStorage()
const upload = multer({ storage })

orderAttachments.post(
  '/orders/attachments/upload',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'file_required' })
      }

      const filename = `order-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`
      const outPath = path.join(uploadsDir, filename)

      await sharp(req.file.buffer)
        .resize(1200)
        .webp({ quality: 80 })
        .toFile(outPath)

      // ✅ La URL pública cuelga de /uploads, servido por server.ts
      const url = `/uploads/orders/${filename}`

      return res.json({ ok: true, url })
    } catch (e) {
      console.error('[orderAttachments] upload error', e)
      return res.status(500).json({ ok: false, error: 'upload_error' })
    }
  },
)



