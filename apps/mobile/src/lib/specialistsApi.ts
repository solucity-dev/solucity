// apps/mobile/src/lib/specialistsApi.ts
import { Platform } from 'react-native';

import { api } from './api';

export type CertItem = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fileUrl: string;
  number: string | null;
  issuer: string | null;
  expiresAt: string | null;
  category: { slug: string; name: string };
};

export async function listCertifications() {
  const { data } = await api.get<{ ok: boolean; items: CertItem[] }>('/specialists/certifications');
  return data.items ?? [];
}

function guessMimeType(filename: string) {
  const ext = (filename.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';

  return 'application/octet-stream';
}

export async function uploadCertificationFile(input: {
  uri: string;
  name?: string;
  mimeType?: string;
  webFile?: File | null;
}) {
  const form = new FormData();

  if (__DEV__) {
    console.log('[uploadCertificationFile] input', {
      uri: input.uri,
      name: input.name,
      mimeType: input.mimeType,
      hasWebFile: !!input.webFile,
      platform: Platform.OS,
    });
  }

  if (Platform.OS === 'web') {
    if (!input.webFile) {
      throw new Error('No se pudo obtener el archivo en web');
    }

    form.append('file', input.webFile, input.webFile.name);
  } else {
    form.append('file', {
      uri: input.uri,
      name: input.name ?? 'cert.jpg',
      type: input.mimeType ?? 'image/jpeg',
    } as any);
  }

  if (__DEV__) {
    console.log('[uploadCertificationFile] checkpoint 2: enviando upload');
  }

  const uploadConfig =
    Platform.OS === 'web'
      ? { timeout: 60000 }
      : {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        };

  const { data } = await api.post<{ ok: boolean; url: string }>(
    '/specialists/certifications/upload',
    form,
    uploadConfig,
  );

  if (__DEV__) {
    console.log('[uploadCertificationFile] checkpoint 3: upload completado', data);
  }

  if (!data?.url) {
    throw new Error('upload_failed_no_url');
  }

  return data.url;
}

export async function uploadCertificationAnyFile(input: {
  uri: string;
  name: string;
  mimeType?: string;
  webFile?: File | null;
}) {
  const form = new FormData();

  if (__DEV__) {
    console.log('[uploadCertificationAnyFile] input', {
      uri: input.uri,
      name: input.name,
      mimeType: input.mimeType,
      hasWebFile: !!input.webFile,
      platform: Platform.OS,
    });
  }

  if (Platform.OS === 'web') {
    if (!input.webFile) {
      throw new Error('No se pudo obtener el archivo en web');
    }

    form.append('file', input.webFile, input.webFile.name);
  } else {
    form.append('file', {
      uri: input.uri,
      name: input.name || 'cert',
      type: input.mimeType ?? guessMimeType(input.name || 'cert'),
    } as any);
  }

  if (__DEV__) {
    console.log('[uploadCertificationAnyFile] checkpoint 2: enviando upload');
  }

  const uploadConfig =
    Platform.OS === 'web'
      ? { timeout: 60000 }
      : {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        };

  const { data } = await api.post<{ ok: boolean; url: string }>(
    '/specialists/certifications/upload',
    form,
    uploadConfig,
  );

  if (__DEV__) {
    console.log('[uploadCertificationAnyFile] checkpoint 3: upload completado', data);
  }

  if (!data?.url) {
    throw new Error('upload_failed_no_url');
  }

  return data.url;
}

export async function upsertCertification(params: {
  categorySlug: string;
  fileUrl: string;
  number?: string;
  issuer?: string;
  expiresAt?: string;
}) {
  const { data } = await api.post('/specialists/certifications', params);
  return data;
}
