// apps/admin-web/src/lib/media.ts
const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') || 'http://localhost:3000';

export function absoluteMediaUrl(u?: string | null) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;         // ya es absoluta
  if (!u.startsWith('/')) return `${API_BASE}/${u}`;
  return u;
}
