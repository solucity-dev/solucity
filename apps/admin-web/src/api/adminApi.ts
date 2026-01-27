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
    backgroundPending: number;
    certificationsPending: number;
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
  daysLeft?: number | null;
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

export type AdminBackgroundCheck = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | string;

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

export async function requestBackgroundCheckUpdate(bgId: string) {
  return apiFetch<{ ok: true }>(
    `/admin/background-checks/${encodeURIComponent(bgId)}/request-update`,
    { method: 'POST' },
  );
}

export async function expireBackgroundCheck(bgId: string) {
  return apiFetch<{ ok: true }>(`/admin/background-checks/${encodeURIComponent(bgId)}/expire`, {
    method: 'PATCH',
  });
}

/* ─────────────────────────────────────────────────────────────
 * ✅ Listados admin (pendientes)
 * ───────────────────────────────────────────────────────────── */

export type AdminLiteSpecialist = {
  specialistId: string;          // ✅ para navegar a /app/specialists/:id
  userId?: string | null;
  name?: string | null;
  email?: string | null;
};

export type AdminCertificationRowList = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  createdAt: string | null;

  fileUrl: string | null;

  category: { id: string; slug: string; name: string } | null;

  specialist: AdminLiteSpecialist | null;
};

export type AdminCertificationsListResp = {
  ok: true;
  count: number;
  items: AdminCertificationRowList[];
};

type BackendCertPendingItem = {
  id: string;
  status: string;
  fileUrl: string | null;
  number?: string | null;
  issuer?: string | null;
  expiresAt?: string | null;
  createdAt: string;

  reviewerId?: string | null;
  rejectionReason?: string | null;
  reviewedAt?: string | null;

  category: { id: string; name: string; slug: string } | null;
  specialist: {
    id: string;           // specialistId real
    userId: string;
    email: string | null;
    name: string | null;
  } | null;
};

export async function getAdminCertificationsList(params?: { status?: string }) {
  const status = (params?.status ?? 'PENDING').toUpperCase();

  // Por ahora tu backend sólo expone pending (según lo pegado)
  if (status !== 'PENDING' && status !== 'ALL') {
    throw new Error(`Backend no soporta /admin/certifications?status=${status}. Solo /pending.`);
  }

  const resp = await apiFetch<{ ok: true; count: number; items: BackendCertPendingItem[] }>(
    '/admin/certifications/pending',
  );

  return {
    ok: true as const,
    count: resp.count,
    items: resp.items.map((c) => ({
      id: c.id,
      status: c.status,
      createdAt: c.createdAt ?? null,
      fileUrl: c.fileUrl ?? null,
      category: c.category
        ? { id: c.category.id, slug: c.category.slug, name: c.category.name }
        : null,
      specialist: c.specialist
        ? {
            specialistId: c.specialist.id,
            userId: c.specialist.userId ?? null,
            email: c.specialist.email ?? null,
            name: c.specialist.name ?? null,
          }
        : null,
    })),
  } satisfies AdminCertificationsListResp;
}

export type AdminBackgroundCheckRowList = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | string;
  createdAt: string | null;

  fileUrl: string | null;

  specialist: AdminLiteSpecialist | null;
};

export type AdminBackgroundChecksListResp = {
  ok: true;
  count: number;
  items: AdminBackgroundCheckRowList[];
};

type BackendBgPendingItem = {
  id: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;

  reviewerId?: string | null;
  rejectionReason?: string | null;
  reviewedAt?: string | null;

  specialistId: string; // ✅ viene flat
  userId?: string | null;
  email?: string | null;
  name?: string | null;
};

export async function getAdminBackgroundChecksList(params?: { status?: string }) {
  const status = (params?.status ?? 'PENDING').toUpperCase();

  if (status !== 'PENDING' && status !== 'ALL') {
    throw new Error(`Backend no soporta /admin/background-checks?status=${status}. Solo /pending.`);
  }

  const resp = await apiFetch<{ ok: true; count: number; items: BackendBgPendingItem[] }>(
    '/admin/background-checks/pending',
  );

  return {
    ok: true as const,
    count: resp.count,
    items: resp.items.map((b) => ({
      id: b.id,
      status: b.status,
      createdAt: b.createdAt ?? null,
      fileUrl: b.fileUrl ?? null,
      specialist: b.specialistId
        ? {
            specialistId: b.specialistId,
            userId: b.userId ?? null,
            email: b.email ?? null,
            name: b.name ?? null,
          }
        : null,
    })),
  } satisfies AdminBackgroundChecksListResp;
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
  return apiFetch<GrantDaysResponse>(
    `/admin/specialists/${encodeURIComponent(specialistId)}/grant-days`,
    {
      method: 'PATCH',
      body: JSON.stringify({ days }),
    },
  );
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

/* ─────────────────────────────────────────────────────────────
 * Customers (admin)
 * ───────────────────────────────────────────────────────────── */

export type AdminCustomerRow = {
  userId: string;
  email: string;
  name: string | null;
  status: UserStatus;
  createdAt: string;
};

export type AdminCustomersResponse = {
  ok: true;
  count: number;
  items: AdminCustomerRow[];
};

export type AdminCustomerDetail = {
  ok: true;
  userId: string;
  email: string;
  name: string | null;
  status: UserStatus;
  createdAt: string | null;
};

export async function getAdminCustomers(params?: { q?: string; status?: UserStatus | 'ALL' }) {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  if (params?.status && params.status !== 'ALL') qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AdminCustomersResponse>(`/admin/customers${suffix}`);
}

export async function getAdminCustomerDetail(id: string) {
  return apiFetch<AdminCustomerDetail>(`/admin/customers/${encodeURIComponent(id)}`);
}

export async function setAdminCustomerStatus(userId: string, status: UserStatus, reason?: string) {
  return apiFetch<{ ok: true; userId: string; status: UserStatus }>(
    `/admin/users/${encodeURIComponent(userId)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status, reason }) },
  );
}

export async function setAdminSpecialistStatus(userId: string, status: UserStatus, reason?: string) {
  return apiFetch<{ ok: true; userId: string; status: UserStatus }>(
    `/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    },
  );
}

/* ─────────────────────────────────────────────────────────────
 * Orders (admin)
 * ───────────────────────────────────────────────────────────── */

export type AdminOrderUserLite = {
  userId?: string | null; // User.id (opcional)
  customerId?: string | null; // CustomerProfile.id (para /customers/:id)
  specialistId?: string | null; // SpecialistProfile.id (para /specialists/:id)

  name?: string | null;
  email?: string | null;
};

export type AdminOrderServiceLite =
  | {
      id: string;
      name: string;
    }
  | null;

export type AdminOrderRow = {
  id: string;
  status: string;
  createdAt: string;

  description: string | null;
  isUrgent: boolean;
  preferredAt: string | null;
  scheduledAt: string | null;

  service: AdminOrderServiceLite;

  customer: AdminOrderUserLite | null;
  specialist: AdminOrderUserLite | null;
};

export type AdminOrdersResp = { ok: true; count: number; items: AdminOrderRow[] };

export async function getAdminOrders(params?: { q?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  if (params?.status?.trim()) qs.set('status', params.status.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AdminOrdersResp>(`/admin/orders${suffix}`);
}

export type AdminOrderDetail = AdminOrderRow & {
  updatedAt?: string;
  attachments: unknown[];
  chatThreadId: string | null;
};

export type AdminOrderDetailResp = { ok: true; order: AdminOrderDetail };

export async function getAdminOrderDetail(id: string) {
  return apiFetch<AdminOrderDetailResp>(`/admin/orders/${encodeURIComponent(id)}`);
}
