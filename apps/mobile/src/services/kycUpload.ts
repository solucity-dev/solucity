// apps/mobile/src/services/kycUpload.ts
import mime from 'mime';

import { api } from '../lib/api';

export async function uploadKycFile(localUri: string, file?: File | null): Promise<string> {
  const name = localUri.split('/').pop() ?? 'photo.jpg';
  const type = mime.getType(name) ?? 'image/jpeg';

  const form = new FormData();

  if (typeof window !== 'undefined') {
    if (file instanceof File) {
      form.append('file', file, file.name || name);
    } else {
      const resp = await fetch(localUri);
      const blob = await resp.blob();
      form.append('file', blob, name);
    }
  } else {
    // @ts-expect-error -- FormData en RN (expo) no tipa perfecto, pero es intencional aquí.
    form.append('file', { uri: localUri, name, type });
  }

  const res = await api.post('/specialists/kyc/upload', form, {
    headers: {},
  });

  if (!res.data?.ok || !res.data?.url) {
    throw new Error(res.data?.error ?? 'upload_failed');
  }

  return res.data.url as string;
}
