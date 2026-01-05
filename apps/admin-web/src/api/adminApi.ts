// apps/admin-web/src/api/adminApi.ts
import { apiFetch } from '../lib/api';

export type AdminMetrics = {
  users: {
    total: number;
    admins: number;
    customers: number;
    specialists: number;
  };
  orders: {
    total: number;
    pending: number;
    active: number;
    finished: number;
    cancelled: number;
  };
  specialists: {
    total: number;
    subscriptions: {
      TRIALING: number;
      ACTIVE: number;
      PAST_DUE: number;
      CANCELLED: number;
    };
    kycPending: number;
  };
};

export async function getAdminMetrics() {
  return apiFetch<AdminMetrics>('/admin/metrics');
}

/* ─────────────────────────────────────────────────────────────
 * Especialistas (listado)
 * ───────────────────────────────────────────────────────────── */

export type AdminSpecialistRow = {
  userId: string;
  specialistId?: string;
  email: string;
  name: string;
  status: 'ACTIVE' | 'BLOCKED';
  createdAt: string; // serializado por JSON
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  ratingAvg: number;
  ratingCount: number;
  avatarUrl: string | null;
  subscription: null | {
    status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
    trialEnd?: string | null;
    currentPeriodEnd?: string | null;
  };
  daysLeft: number | null;

  // ✅ NUEVO
  specialties?: { slug: string; name: string }[];
  specialtySlugs?: string[];
};

export async function getAdminSpecialists() {
  return apiFetch<AdminSpecialistRow[]>('/admin/specialists');
}

/* ─────────────────────────────────────────────────────────────
 * Especialistas (detalle)
 * ───────────────────────────────────────────────────────────── */

export type AdminCertificationItem = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  fileUrl: string | null;
  number: string | null;
  issuer: string | null;
  expiresAt?: string | null;

  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt?: string | null;

  category: {
    id: string;
    slug: string;
    name: string;
  };
};

export type AdminSpecialistDetail = {
  userId: string;
  specialistId: string;

  // Identidad
  name: string;
  email: string;
  phone?: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  createdAt: string;

  // Perfil
  avatarUrl: string | null;
  bio: string | null;
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;
  ratingAvg: number | null;
  ratingCount: number | null;

  // Operación
  availableNow?: boolean | null;
  radiusKm?: number | null;
  visitPrice?: number | null;
  currency?: string | null;

  // Especialidades
  specialties: { id: string; name: string; slug: string }[];

  // Suscripción
  subscription: null | {
    status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
    trialEnd?: string | null;
    currentPeriodEnd?: string | null;
  };

  // KYC (si querés mostrar links)
  kyc?: null | {
    id?: string; // 👈 importante si querés aprobar/rechazar desde el detail
    dniFrontUrl?: string | null;
    dniBackUrl?: string | null;
    selfieUrl?: string | null;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
    rejectionReason?: string | null;
    createdAt?: string | null;
    reviewedAt?: string | null;
  };

  // ✅ Certificaciones / matrículas por rubro
  certifications?: AdminCertificationItem[];
};

export async function getAdminSpecialistDetail(id: string) {
  // id puede ser specialistId (ideal) o userId según como lo armes en backend.
  // Nosotros lo usaremos como param en la ruta /admin/specialists/:id
  return apiFetch<AdminSpecialistDetail>(`/admin/specialists/${encodeURIComponent(id)}`);
}

/* ─────────────────────────────────────────────────────────────
 * KYC (acciones)
 * ───────────────────────────────────────────────────────────── */

export async function approveKyc(submissionId: string) {
  return apiFetch<{ ok: true }>(`/admin/kyc/${submissionId}/approve`, {
    method: 'PATCH',
  });
}

export async function rejectKyc(submissionId: string, reason: string) {
  return apiFetch<{ ok: true }>(`/admin/kyc/${submissionId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

/* ─────────────────────────────────────────────────────────────
 * Certificaciones (acciones admin)
 * ───────────────────────────────────────────────────────────── */

export async function approveCertification(certId: string) {
  return apiFetch<{ ok: true }>(`/admin/certifications/${certId}/approve`, {
    method: 'PATCH',
  });
}

export async function rejectCertification(certId: string, reason: string) {
  return apiFetch<{ ok: true }>(`/admin/certifications/${certId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}






