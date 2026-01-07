// apps/mobile/src/api/password.ts
import { api } from '../lib/api';

// POST /auth/password/start
export async function passwordStart(email: string) {
  const { data } = await api.post('/auth/password/start', { email });
  return data; // { ok:true, otpId:'ok', expiresAt }
}

// POST /auth/password/verify
export async function passwordVerify(email: string, code: string, newPassword: string) {
  const { data } = await api.post('/auth/password/verify', {
    email,
    code,
    newPassword,
  });
  return data; // { ok:true, user, token }
}
