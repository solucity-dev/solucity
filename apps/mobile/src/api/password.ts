// apps/mobile/src/api/password.ts
import { api } from '../lib/api';

// POST /auth/password/start
export async function passwordStart(email: string) {
  const cleanEmail = email.trim().toLowerCase();

  const { data } = await api.post('/auth/password/start', {
    email: cleanEmail,
  });

  return data;
}

// POST /auth/password/verify
export async function passwordVerify(email: string, code: string, newPassword: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const { data } = await api.post('/auth/password/verify', {
    email: cleanEmail,
    code: cleanCode,
    newPassword,
  });

  return data;
}
