// apps/mobile/src/lib/specialistsApi.ts
import { api } from './api'

export type CertItem = {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  fileUrl: string
  number: string | null
  issuer: string | null
  expiresAt: string | null
  category: { slug: string; name: string }
}

export async function listCertifications() {
  const { data } = await api.get<{ ok: boolean; items: CertItem[] }>('/specialists/certifications')
  return data.items ?? []
}

export async function uploadCertificationFile(localUri: string) {
  const form = new FormData()
  form.append('file', { uri: localUri, name: 'cert.jpg', type: 'image/jpeg' } as any)
  const { data } = await api.post<{ ok: boolean; url: string }>(
    '/specialists/certifications/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data.url // relativo (/uploads/...)
}

export async function upsertCertification(params: {
  categorySlug: string
  fileUrl: string
  number?: string
  issuer?: string
  expiresAt?: string // ISO opcional
}) {
  const { data } = await api.post('/specialists/certifications', params)
  return data
}
