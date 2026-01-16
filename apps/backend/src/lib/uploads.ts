import fs from 'fs';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';

// 👉 En Render Disk: /var/data/uploads
// 👉 En local: apps/backend/uploads
export const uploadsRoot =
  isProd && process.env.UPLOADS_DIR
    ? process.env.UPLOADS_DIR
    : path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

export function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Log útil (solo para verificar una vez)
if (process.env.NODE_ENV !== 'test') {
  console.log('[uploads] uploadsRoot =', uploadsRoot);
}
