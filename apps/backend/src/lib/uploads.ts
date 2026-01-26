// apps/backend/src/lib/uploads.ts
import fs from 'fs';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';

/**
 * En Render:
 * - Montás disk en /var/data
 * - UPLOADS_DIR debe ser /var/data/uploads
 *
 * En local:
 * - usa <repo>/uploads
 */
export const uploadsRoot =
  isProd && process.env.UPLOADS_DIR?.trim()
    ? process.env.UPLOADS_DIR.trim()
    : path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

export function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Crea estructura mínima esperada (evita 500 por "ENOENT")
 * Llamalo una sola vez al boot.
 */
export function ensureUploadsStructure() {
  ensureDir(uploadsRoot);
  ensureDir(path.join(uploadsRoot, 'avatars'));
  ensureDir(path.join(uploadsRoot, 'customers'));
  ensureDir(path.join(uploadsRoot, 'specialists'));
  ensureDir(path.join(uploadsRoot, 'orders'));
  ensureDir(path.join(uploadsRoot, 'kyc'));
  ensureDir(path.join(uploadsRoot, 'background-checks'));
  ensureDir(path.join(uploadsRoot, 'certifications'));
}

/** Construye path absoluto dentro del uploadsRoot */
export function uploadPath(...parts: string[]) {
  return path.join(uploadsRoot, ...parts);
}

/**
 * Convierte "/uploads/..." => URL absoluta (si PUBLIC_BASE_URL existe)
 * Si ya es http(s), lo deja.
 */
export function toAbsoluteUploadUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;

  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ||
    `http://localhost:${process.env.PORT || 3000}`;

  return `${base}${u.startsWith('/') ? '' : '/'}${u}`;
}

if (process.env.NODE_ENV !== 'test') {
  console.log('[uploads] uploadsRoot =', uploadsRoot);
  if (isProd && !process.env.UPLOADS_DIR) {
    console.warn('[uploads] NODE_ENV=production pero UPLOADS_DIR no está seteada');
  }
}

export function safeUnlink(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // no hacemos throw: es limpieza best-effort
  }
}

/**
 * Convierte "/uploads/avatars/abc.jpg" -> "<uploadsRoot>/avatars/abc.jpg"
 * Devuelve null si no es un path de uploads esperado.
 */
export function resolveUploadsPath(uploadsRoot: string, url: string): string | null {
  if (!url.startsWith('/uploads/')) return null;

  // url sin prefijo "/uploads/"
  const relative = url.replace(/^\/uploads\//, ''); // "avatars/abc.jpg"
  return path.join(uploadsRoot, relative);
}
