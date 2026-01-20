// apps/admin-web/src/api/adminApi.ts
import { apiFetch } from '../lib/api';

/* ─────────────────────────────────────────────────────────────
 * Metrics
 * ───────────────────────────────────────────────────────────── */

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
 * Types compartidos
 * ───────────────────────────────────────────────────────────── */

export type KycStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

export type SubscriptionDTO = {
  status: SubscriptionStatus;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  daysLeft?: number | null; // 👈 en detail puede venir
};

export type AdminSpecialtyChip = {
  slug: string;
  name: string;
};

/* ─────────────────────────────────────────────────────────────
 * Especialistas (listado)
 * ───────────────────────────────────────────────────────────── */

export type AdminSpecialistRow = {
  userId: string;
  specialistId?: string;

  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;

  kycStatus: KycStatus;

  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | string;
  ratingAvg: number;
  ratingCount: number;

  avatarUrl: string | null;

  subscription: SubscriptionDTO | null;
  daysLeft: number | null;

  specialties?: AdminSpecialtyChip[];
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
  expiresAt: string | null;

  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string | null;

  category: {
    id: string;
    slug: string;
    name: string;
  } | null;
};

export type AdminKycSubmission = {
  id: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | string;

  dniFrontUrl: string | null;
  dniBackUrl: string | null;
  selfieUrl: string | null;

  rejectionReason: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
};

/* ─────────────────────────────────────────────────────────────
 * Background Check (detalle)
 * ───────────────────────────────────────────────────────────── */

export type AdminBackgroundCheck = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;

  fileUrl: string | null;

  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
};

export type AdminSpecialistDetail = {
  userId: string;
  specialistId: string;

  name: string;
  email: string;
  phone?: string | null;
  status: UserStatus;
  createdAt: string | null;

  avatarUrl: string | null;
  bio: string | null;

  kycStatus: KycStatus;
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | string | null;

  ratingAvg: number | null;
  ratingCount: number | null;

  availableNow: boolean | null;
  radiusKm: number | null;
  visitPrice: number | null;
  currency: string | null;

  specialties: { id: string; name: string; slug: string }[];

  subscription: (SubscriptionDTO & { daysLeft?: number | null }) | null;

  kyc: AdminKycSubmission | null;

    backgroundCheck: AdminBackgroundCheck | null;

  certifications: AdminCertificationItem[];
};

export async function getAdminSpecialistDetail(id: string) {
  return apiFetch<AdminSpecialistDetail>(`/admin/specialists/${encodeURIComponent(id)}`);
}

/* ─────────────────────────────────────────────────────────────
 * KYC (acciones)
 * ───────────────────────────────────────────────────────────── */

export async function approveKyc(submissionId: string) {
  return apiFetch<{ ok: true }>(`/admin/kyc/${encodeURIComponent(submissionId)}/approve`, {
    method: 'PATCH',
  });
}

export async function rejectKyc(submissionId: string, reason: string) {
  return apiFetch<{ ok: true }>(`/admin/kyc/${encodeURIComponent(submissionId)}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

/* ─────────────────────────────────────────────────────────────
 * Certificaciones (acciones admin)
 * ───────────────────────────────────────────────────────────── */

export async function approveCertification(certId: string) {
  return apiFetch<{ ok: true }>(`/admin/certifications/${encodeURIComponent(certId)}/approve`, {
    method: 'PATCH',
  });
}

export async function rejectCertification(certId: string, reason: string) {
  return apiFetch<{ ok: true }>(`/admin/certifications/${encodeURIComponent(certId)}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

/* ─────────────────────────────────────────────────────────────
 * Background Check (acciones admin)
 * ───────────────────────────────────────────────────────────── */

export async function approveBackgroundCheck(bgId: string) {
  return apiFetch<{ ok: true }>(`/admin/background-checks/${encodeURIComponent(bgId)}/approve`, {
    method: 'PATCH',
  });
}

export async function rejectBackgroundCheck(bgId: string, reason: string) {
  return apiFetch<{ ok: true }>(`/admin/background-checks/${encodeURIComponent(bgId)}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

/* ─────────────────────────────────────────────────────────────
 * Grant days (admin)
 * ───────────────────────────────────────────────────────────── */

export type GrantDaysResponse = {
  ok: boolean;
  subscription?: {
    id: string | null;
    status: string | null;
    trialEnd: string | null;
    currentPeriodEnd: string | null;
    currentPeriodStart: string | null;
  };
  notificationId?: string;
  daysGranted?: number;
  specialist?: {
    id: string;
    name: string | null;
    userId: string;
  };
  message?: string;
  error?: string;
};

export async function grantDaysToSpecialist(specialistId: string, days: number) {
  return apiFetch<GrantDaysResponse>(`/admin/specialists/${encodeURIComponent(specialistId)}/grant-days`, {
    method: 'PATCH',
    body: JSON.stringify({ days }),
  });
}

/* ─────────────────────────────────────────────────────────────
 * Admin - delete/anonymize user
 * ───────────────────────────────────────────────────────────── */

export type DeleteAdminUserMode = 'anonymize' | 'hard';

export type DeleteAdminUserResponse = {
  ok: boolean;
  mode?: string;
  userId?: string;
  oldEmail?: string;
  newEmail?: string;
  error?: string;
  message?: string;
};

export async function deleteAdminUser(userId: string, mode: DeleteAdminUserMode = 'anonymize') {
  return apiFetch<DeleteAdminUserResponse>(
    `/admin/users/${encodeURIComponent(userId)}?mode=${encodeURIComponent(mode)}`,
    { method: 'DELETE' },
  );
}








