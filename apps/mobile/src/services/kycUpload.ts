// apps/mobile/src/services/kycUpload.ts
import mime from 'mime';

import { api } from '../lib/api';

export async function uploadKycFile(localUri: string): Promise<string> {
  const name = localUri.split('/').pop() ?? 'photo.jpg';
  const type = mime.getType(name) ?? 'image/jpeg';

  const form = new FormData();
  // @ts-expect-error -- FormData en RN (expo) no tipa perfecto, pero es intencional aquí.
  form.append('file', { uri: localUri, name, type });

  const res = await api.post('/specialists/kyc/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (!res.data?.ok) throw new Error(res.data?.error ?? 'upload_failed');
  return res.data.url as string;
}
