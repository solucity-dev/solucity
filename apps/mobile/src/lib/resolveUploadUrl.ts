//apps/mobile/src/lib/resolveUploadUrl.ts
import { API_URL } from './api';

/**
 * Convierte una ruta relativa de uploads en URL absoluta válida
 * - /uploads/avatars/xxx.png  -> https://backend/uploads/avatars/xxx.png
 * - https://...               -> se devuelve tal cual
 * - null / undefined          -> undefined
 */
export function resolveUploadUrl(path?: string | null): string | undefined {
  if (!path) return undefined;

  // ya es absoluta
  if (/^https?:\/\//i.test(path)) return path;

  const base = API_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
