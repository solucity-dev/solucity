import fs from 'fs';
import path from 'path';

// En runtime: .../apps/backend/dist/src/lib
// Subimos 4 niveles: lib -> src -> dist -> backend
export const uploadsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'uploads'); // apps/backend/uploads

export function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
