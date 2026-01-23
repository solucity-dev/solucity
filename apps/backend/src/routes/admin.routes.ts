// apps/backend/src/routes/admin.routes.ts
import { Router } from 'express';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { notifyBackgroundCheckStatus } from '../services/notifyBackgroundCheck';
import { notifyCertificationStatus } from '../services/notifyCertification';
import { notifyKycStatus } from '../services/notifyKyc';
import { sendExpoPush } from '../services/pushExpo';

const adminRouter = Router();

/** Util: normalizar URL absoluta a partir de /uploads/... */
function toAbsoluteUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;

  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ||
    `http://localhost:${process.env.PORT || 3000}`;

  return `${base}${u.startsWith('/') ? '' : '/'}${u}`;
}

function requireAdmin(req: any, res: any, next: any) {
  try {
    const auth = String(req.headers.authorization ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return res.status(401).json({ ok: false, error: 'missing_token' });

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'jwt_not_configured' });

    const payload = jwt.verify(token, JWT_SECRET as Secret) as any;
    if (payload?.role !== 'ADMIN') {
      return res.status(403).json({ ok: false, error: 'admin_only' });
    }

    (req as any).admin = payload;

    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
}

/**
 * POST /admin/auth/login
 * Login de admin contra variables de entorno (ADMIN_EMAIL / ADMIN_PASSWORD).
 * Devuelve un JWT con role ADMIN.
 */
adminRouter.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '')
    .trim()
    .toLowerCase();
  const password = String(req.body?.password ?? '');

  const envEmail = String(process.env.ADMIN_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const envPass = String(process.env.ADMIN_PASSWORD ?? '');
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!envEmail || !envPass || !JWT_SECRET) {
    return res.status(500).json({ code: 'admin_auth_not_configured' });
  }

  if (email !== envEmail || password !== envPass) {
    return res.status(401).json({ code: 'invalid_credentials' });
  }

  const adminUser = await prisma.user.upsert({
    where: { email: envEmail },
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email: envEmail,
      passwordHash: 'ENV_ADMIN',
      role: 'ADMIN',
      status: 'ACTIVE',
      name: 'Solucity',
      surname: 'Admin',
    },
    select: { id: true, email: true, role: true },
  });

  const expiresIn: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN ?? '7d') as
    | SignOptions['expiresIn']
    | undefined;

  const token = jwt.sign(
    { sub: adminUser.id, role: 'ADMIN', email: adminUser.email },
    JWT_SECRET as Secret,
    { expiresIn },
  );

  return res.json({ token });
});

// ✅ A partir de acá, TODO requiere ADMIN token
adminRouter.use(requireAdmin);

// ✅ STATUS ADMIN (bloquear / activar usuarios)

const SetUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'BLOCKED']),
  reason: z.string().min(2).max(500).optional().nullable(),
});

async function notifyAccountStatusChange(params: {
  userId: string;
  status: 'ACTIVE' | 'BLOCKED';
  reason?: string | null;
  adminId?: string | null;
}) {
  const title = params.status === 'BLOCKED' ? 'Cuenta bloqueada' : 'Cuenta activada';
  const body =
    params.status === 'BLOCKED'
      ? `Tu cuenta fue bloqueada.${params.reason ? ` Motivo: ${params.reason}` : ''}`
      : 'Tu cuenta fue activada nuevamente.';

  const notif = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: 'ACCOUNT_STATUS_CHANGED',
      title,
      body,
      data: {
        status: params.status,
        reason: params.reason ?? null,
        adminId: params.adminId ?? null,
      } as any,
    },
    select: { id: true, title: true, body: true },
  });

  try {
    await pushToUser({
      userId: params.userId,
      title: notif.title ?? title,
      body: notif.body ?? body,
      data: {
        notificationId: notif.id,
        type: 'ACCOUNT_STATUS_CHANGED',
        status: params.status,
      },
    });
  } catch (e) {
    console.warn('[push] ACCOUNT_STATUS_CHANGED failed', e);
  }

  return notif.id;
}

/**
 * PATCH /admin/users/:userId/status
 * Body: { status: 'ACTIVE' | 'BLOCKED', reason?: string }
 */
adminRouter.patch('/users/:userId/status', async (req, res) => {
  const userId = String(req.params.userId ?? '').trim();
  if (!userId) return res.status(400).json({ ok: false, error: 'userId_required' });

  const parsed = SetUserStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const { status, reason } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      specialist: { select: { id: true } },
    },
  });

  if (!user) return res.status(404).json({ ok: false, error: 'not_found' });

  // Si ya está en ese estado, igual devolvemos ok (idempotente)
  if (user.status === status) {
    return res.json({ ok: true, userId, status, already: true });
  }

  const adminId = (req as any).admin?.sub ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status },
    });

    // Si bloqueamos especialista -> forzamos availableNow=false
    if (user.role === 'SPECIALIST' && user.specialist?.id && status === 'BLOCKED') {
      await tx.specialistProfile.update({
        where: { id: user.specialist.id },
        data: { availableNow: false },
      });
    }
  });

  // notificación al usuario (push + DB)
  const notificationId = await notifyAccountStatusChange({
    userId,
    status,
    reason: reason ?? null,
    adminId,
  }).catch((e) => {
    console.warn('[admin] notifyAccountStatusChange failed', e);
    return null;
  });

  return res.json({ ok: true, userId, status, notificationId });
});

/**
 * ✅ Alias por si tu adminApi usa /admin/specialists/:userId/status
 * PATCH /admin/specialists/:userId/status
 */
adminRouter.patch('/specialists/:userId/status', async (req, res, next) => {
  // Reutilizamos el handler principal redirigiendo params.
  // Express no “reinyecta” fácil, así que lo resolvemos llamando al mismo path interno:
  (req as any).params.userId = String(req.params.userId ?? '').trim();
  return (adminRouter as any).handle(
    { ...req, url: `/users/${(req as any).params.userId}/status`, method: 'PATCH' },
    res,
    next,
  );
});

/**
 * ✅ CUSTOMERS ADMIN (MVP - User only)
 * No depende de relaciones "customer" ni de CustomerProfile
 */

/** GET /admin/customers?status=ACTIVE|BLOCKED&q=... */
adminRouter.get('/customers', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '')
    .trim()
    .toUpperCase();

  const where: any = { role: 'CUSTOMER' };

  if (status === 'ACTIVE' || status === 'BLOCKED') {
    where.status = status;
  }

  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { surname: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      phone: true,
      status: true,
      createdAt: true,
      customer: { select: { id: true, avatarUrl: true } },
    },
    take: 500,
  });

  return res.json({
    ok: true,
    count: users.length,
    items: users.map((u) => ({
      userId: u.id,
      customerId: u.customer?.id ?? null,
      email: u.email,
      name: `${u.name ?? ''} ${u.surname ?? ''}`.trim() || null,
      phone: u.phone ?? null,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      avatarUrl: u.customer?.avatarUrl ?? null,
    })),
  });
});

/** GET /admin/customers/:id (id = userId OR customerId) */
adminRouter.get('/customers/:id', async (req, res) => {
  const { id } = req.params;

  // 1) intento como userId
  let user = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      status: true,
      createdAt: true,
      customer: { select: { id: true, avatarUrl: true } },
    },
  });

  // 2) si no existe, intento como customerId (CustomerProfile.id)
  if (!user) {
    const customer = await prisma.customerProfile.findUnique({
      where: { id },
      select: {
        id: true,
        avatarUrl: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            surname: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (customer?.user) {
      // armamos una "forma" compatible con el resto
      user = {
        ...customer.user,
        customer: { id: customer.id, avatarUrl: customer.avatarUrl },
      } as any;
    }
  }

  if (!user) return res.status(404).json({ ok: false, error: 'not_found' });

  return res.json({
    ok: true,
    userId: user.id,
    customerId: (user as any).customer?.id ?? null,
    email: user.email,
    name: `${user.name ?? ''} ${user.surname ?? ''}`.trim() || null,
    status: user.status,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    avatarUrl: (user as any).customer?.avatarUrl ?? null,
  });
});

/**
 * GET /admin/metrics
 */
adminRouter.get('/metrics', async (_req, res) => {
  const [
    usersTotal,
    adminsTotal,
    customersTotal,
    specialistsTotal,

    ordersTotal,
    ordersPending,
    ordersActive,
    ordersFinished,
    ordersCancelled,

    subsByStatus,
    kycPending,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'SPECIALIST' } }),

    prisma.serviceOrder.count(),
    prisma.serviceOrder.count({ where: { status: 'PENDING' } }),
    prisma.serviceOrder.count({
      where: {
        status: {
          in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'FINISHED_BY_SPECIALIST', 'IN_CLIENT_REVIEW'],
        },
      },
    }),
    prisma.serviceOrder.count({
      where: { status: { in: ['CONFIRMED_BY_CLIENT', 'CLOSED'] } },
    }),
    prisma.serviceOrder.count({
      where: {
        status: {
          in: [
            'CANCELLED_BY_CUSTOMER',
            'CANCELLED_BY_SPECIALIST',
            'CANCELLED_AUTO',
            'REJECTED_BY_CLIENT',
          ],
        },
      },
    }),

    prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),

    prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
  ]);

  const subs = Object.fromEntries(subsByStatus.map((x) => [x.status, x._count._all]));

  res.json({
    users: {
      total: usersTotal,
      admins: adminsTotal,
      customers: customersTotal,
      specialists: specialistsTotal,
    },
    orders: {
      total: ordersTotal,
      pending: ordersPending,
      active: ordersActive,
      finished: ordersFinished,
      cancelled: ordersCancelled,
    },
    specialists: {
      total: specialistsTotal,
      subscriptions: {
        TRIALING: subs.TRIALING ?? 0,
        ACTIVE: subs.ACTIVE ?? 0,
        PAST_DUE: subs.PAST_DUE ?? 0,
        CANCELLED: subs.CANCELLED ?? 0,
      },
      kycPending,
    },
  });
});

/**
 * ✅ ORDERS ADMIN
 * Listado + detalle (para admin-web)
 *
 * 🔥 FIX REAL:
 * ServiceOrder.customerId = CustomerProfile.id (NO User.id)
 * ServiceOrder.specialistId = SpecialistProfile.id (NO User.id)
 */

// GET /admin/orders?q=&status=
adminRouter.get('/orders', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const statusRaw = String(req.query.status ?? '')
    .trim()
    .toUpperCase();

  const where: any = {};
  if (statusRaw && statusRaw !== 'ALL') where.status = statusRaw;

  if (q) {
    where.OR = [
      { id: { contains: q, mode: 'insensitive' } },
      { customer: { user: { email: { contains: q, mode: 'insensitive' } } } },
      { specialist: { user: { email: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const orders = await prisma.serviceOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      status: true,
      createdAt: true,
      description: true,
      isUrgent: true,
      preferredAt: true,
      scheduledAt: true,

      // ✅ servicio + rubro
      service: {
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },

      customer: {
        select: {
          id: true, // CustomerProfile.id
          userId: true, // User.id
          user: { select: { id: true, name: true, surname: true, email: true } },
        },
      },

      specialist: {
        select: {
          id: true, // SpecialistProfile.id
          userId: true, // User.id
          user: { select: { id: true, name: true, surname: true, email: true } },
        },
      },
    },
  });

  return res.json({
    ok: true,
    count: orders.length,
    items: orders.map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      description: o.description ?? null,
      isUrgent: Boolean(o.isUrgent),
      preferredAt: o.preferredAt ? o.preferredAt.toISOString() : null,
      scheduledAt: o.scheduledAt ? o.scheduledAt.toISOString() : null,

      customer: o.customer?.user
        ? {
            userId: o.customer.user.id,
            customerId: o.customer.id,
            name: `${o.customer.user.name ?? ''} ${o.customer.user.surname ?? ''}`.trim() || null,
            email: o.customer.user.email ?? null,
          }
        : null,

      specialist: o.specialist?.user
        ? {
            userId: o.specialist.user.id,
            specialistId: o.specialist.id,
            name:
              `${o.specialist.user.name ?? ''} ${o.specialist.user.surname ?? ''}`.trim() || null,
            email: o.specialist.user.email ?? null,
          }
        : null,

      rubro: o.service?.category
        ? {
            id: o.service.category.id,
            name: o.service.category.name,
            slug: o.service.category.slug,
          }
        : null,

      serviceCategory: o.service?.category
        ? {
            id: o.service.category.id,
            name: o.service.category.name,
            slug: o.service.category.slug,
          }
        : null,

      service: o.service ? { id: o.service.id, name: o.service.name } : null,
    })),
  });
});

// GET /admin/orders/:id
adminRouter.get('/orders/:id', async (req, res) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  const o = await prisma.serviceOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      description: true,
      isUrgent: true,
      preferredAt: true,
      scheduledAt: true,
      attachments: true,

      chatThread: { select: { id: true } },

      service: {
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },

      customer: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, name: true, surname: true, email: true } },
        },
      },

      specialist: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, name: true, surname: true, email: true } },
        },
      },
    },
  });

  if (!o) return res.status(404).json({ ok: false, error: 'not_found' });

  return res.json({
    ok: true,
    order: {
      id: o.id,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      description: o.description ?? null,
      isUrgent: Boolean(o.isUrgent),
      preferredAt: o.preferredAt ? o.preferredAt.toISOString() : null,
      scheduledAt: o.scheduledAt ? o.scheduledAt.toISOString() : null,
      attachments: Array.isArray(o.attachments) ? (o.attachments as any[]) : [],
      chatThreadId: o.chatThread?.id ?? null,

      customer: o.customer?.user
        ? {
            userId: o.customer.user.id,
            customerId: o.customer.id,
            name: `${o.customer.user.name ?? ''} ${o.customer.user.surname ?? ''}`.trim() || null,
            email: o.customer.user.email ?? null,
          }
        : null,

      specialist: o.specialist?.user
        ? {
            userId: o.specialist.user.id,
            specialistId: o.specialist.id,
            name:
              `${o.specialist.user.name ?? ''} ${o.specialist.user.surname ?? ''}`.trim() || null,
            email: o.specialist.user.email ?? null,
          }
        : null,

      rubro: o.service?.category
        ? {
            id: o.service.category.id,
            name: o.service.category.name,
            slug: o.service.category.slug,
          }
        : null,

      serviceCategory: o.service?.category
        ? {
            id: o.service.category.id,
            name: o.service.category.name,
            slug: o.service.category.slug,
          }
        : null,

      service: o.service ? { id: o.service.id, name: o.service.name } : null,
    },
  });
});

/**
 * GET /admin/specialists
 */
adminRouter.get('/specialists', async (_req, res) => {
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { role: 'SPECIALIST' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      status: true,
      createdAt: true,
      specialist: {
        select: {
          id: true,
          kycStatus: true,
          badge: true,
          ratingAvg: true,
          ratingCount: true,
          avatarUrl: true,
          specialties: {
            select: { category: { select: { slug: true, name: true } } },
          },
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              currentPeriodStart: true,
              trialEnd: true,
            },
          },
        },
      },
    },
    take: 500,
  });

  const result = users.map((u) => {
    const sub = u.specialist?.subscription;
    const end = sub?.trialEnd ?? sub?.currentPeriodEnd ?? null;

    const daysLeft = end
      ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const specSpecialties = u.specialist?.specialties ?? [];

    const specialties = specSpecialties.map((s) => ({
      slug: s.category.slug,
      name: s.category.name,
    }));

    const specialtySlugs = specialties.map((s) => s.slug);

    return {
      userId: u.id,
      specialistId: u.specialist?.id,
      email: u.email,
      name: `${u.name ?? ''} ${u.surname ?? ''}`.trim(),
      status: u.status,
      createdAt: u.createdAt,

      kycStatus: u.specialist?.kycStatus ?? 'UNVERIFIED',
      badge: u.specialist?.badge ?? 'BRONZE',
      ratingAvg: u.specialist?.ratingAvg ?? 0,
      ratingCount: u.specialist?.ratingCount ?? 0,
      avatarUrl: u.specialist?.avatarUrl ?? null,

      subscription: sub
        ? {
            status: sub.status,
            trialEnd: sub.trialEnd,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,

      daysLeft,

      specialties,
      specialtySlugs,
    };
  });

  res.json(result);
});

/**
 * GET /admin/specialists/:id
 * ✅ FIX: ahora incluye spec.certifications y lo devuelve en el JSON
 */
adminRouter.get('/specialists/:id', async (req, res) => {
  const { id } = req.params;

  const specialistSelect = {
    id: true,
    bio: true,
    visitPrice: true,
    currency: true,
    availableNow: true,
    radiusKm: true,

    kycStatus: true,
    badge: true,
    ratingAvg: true,
    ratingCount: true,
    avatarUrl: true,

    subscription: {
      select: { status: true, trialEnd: true, currentPeriodEnd: true },
    },

    specialties: {
      select: { category: { select: { id: true, name: true, slug: true } } },
    },

    kycSubmissions: {
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: {
        id: true,
        status: true,
        dniFrontUrl: true,
        dniBackUrl: true,
        selfieUrl: true,
        rejectionReason: true,
        createdAt: true,
        reviewedAt: true,
      },
    },

    backgroundCheck: {
      select: {
        id: true,
        status: true,
        fileUrl: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    },

    certifications: {
      orderBy: { createdAt: 'desc' as const },
      select: {
        id: true,
        status: true,
        fileUrl: true,
        number: true,
        issuer: true,
        expiresAt: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        category: { select: { id: true, slug: true, name: true } },
      },
    },
  } as const;

  let user = await prisma.user.findFirst({
    where: { role: 'SPECIALIST', specialist: { is: { id } } },
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      status: true,
      createdAt: true,
      specialist: { select: specialistSelect },
    },
  });

  if (!user) {
    user = await prisma.user.findFirst({
      where: { id, role: 'SPECIALIST' },
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        status: true,
        createdAt: true,
        specialist: { select: specialistSelect },
      },
    });
  }

  if (!user || !user.specialist) {
    return res.status(404).json({ ok: false, error: 'Not Found' });
  }

  const spec = user.specialist;
  const lastKyc = spec.kycSubmissions?.[0] ?? null;

  const specialties = (spec.specialties ?? []).map((s) => ({
    id: s.category.id,
    name: s.category.name,
    slug: s.category.slug,
  }));

  const now = new Date();
  const sub = spec.subscription;
  const end = sub?.trialEnd ?? sub?.currentPeriodEnd ?? null;
  const daysLeft = end
    ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const certifications = (spec.certifications ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    fileUrl: toAbsoluteUrl(c.fileUrl) ?? null,
    number: c.number ?? null,
    issuer: c.issuer ?? null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,

    rejectionReason: c.rejectionReason ?? null,
    reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,

    category: c.category
      ? { id: c.category.id, slug: c.category.slug, name: c.category.name }
      : null,
  }));

  return res.json({
    userId: user.id,
    specialistId: spec.id,

    email: user.email,
    name: `${user.name ?? ''} ${user.surname ?? ''}`.trim(),
    status: user.status,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,

    kycStatus: spec.kycStatus ?? 'UNVERIFIED',
    badge: spec.badge ?? 'BRONZE',
    ratingAvg: spec.ratingAvg ?? 0,
    ratingCount: spec.ratingCount ?? 0,
    avatarUrl: spec.avatarUrl ?? null,

    availableNow: spec.availableNow ?? false,
    radiusKm: spec.radiusKm ?? null,
    visitPrice: spec.visitPrice ?? null,
    currency: spec.currency ?? null,
    bio: spec.bio ?? null,

    specialties,

    kyc: lastKyc
      ? {
          id: lastKyc.id,
          status: lastKyc.status,
          dniFrontUrl: lastKyc.dniFrontUrl ?? null,
          dniBackUrl: lastKyc.dniBackUrl ?? null,
          selfieUrl: lastKyc.selfieUrl ?? null,
          rejectionReason: lastKyc.rejectionReason ?? null,
          createdAt: lastKyc.createdAt ? lastKyc.createdAt.toISOString() : null,
          reviewedAt: lastKyc.reviewedAt ? lastKyc.reviewedAt.toISOString() : null,
        }
      : null,

    backgroundCheck: spec.backgroundCheck
      ? {
          id: spec.backgroundCheck.id,
          status: spec.backgroundCheck.status,
          fileUrl: toAbsoluteUrl(spec.backgroundCheck.fileUrl) ?? null,
          rejectionReason: spec.backgroundCheck.rejectionReason ?? null,
          reviewedAt: spec.backgroundCheck.reviewedAt
            ? spec.backgroundCheck.reviewedAt.toISOString()
            : null,
          createdAt: spec.backgroundCheck.createdAt
            ? spec.backgroundCheck.createdAt.toISOString()
            : null,
        }
      : null,

    subscription: sub
      ? {
          status: sub.status,
          trialEnd: sub.trialEnd ? sub.trialEnd.toISOString() : null,
          currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
          daysLeft,
        }
      : null,

    certifications,
  });
});

/**
 * ✅ KYC ADMIN
 */

/** GET /admin/kyc/pending */
adminRouter.get('/kyc/pending', async (_req, res) => {
  const items = await prisma.kycSubmission.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      status: true,
      dniFrontUrl: true,
      dniBackUrl: true,
      selfieUrl: true,
      rejectionReason: true,
      createdAt: true,
      specialistId: true,
      specialist: {
        select: {
          userId: true,
          user: { select: { email: true, name: true, surname: true } },
        },
      },
    },
  });

  return res.json({
    ok: true,
    count: items.length,
    items: items.map((x) => ({
      id: x.id,
      status: x.status,
      createdAt: x.createdAt,
      dniFrontUrl: x.dniFrontUrl,
      dniBackUrl: x.dniBackUrl,
      selfieUrl: x.selfieUrl,
      rejectionReason: x.rejectionReason ?? null,
      specialistId: x.specialistId,
      userId: x.specialist?.userId ?? null,
      email: x.specialist?.user?.email ?? null,
      name: `${x.specialist?.user?.name ?? ''} ${x.specialist?.user?.surname ?? ''}`.trim() || null,
    })),
  });
});

const ApproveKycSchema = z.object({
  reviewerId: z.string().optional().nullable(),
});

const RejectKycSchema = z.object({
  reason: z.string().min(2).max(500),
  reviewerId: z.string().optional().nullable(),
});

/** PATCH /admin/kyc/:submissionId/approve */
adminRouter.patch('/kyc/:submissionId/approve', async (req, res) => {
  const submissionId = String(req.params.submissionId ?? '').trim();
  if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId_required' });

  const parsed = ApproveKycSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const submission = await prisma.kycSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      specialistId: true,
      specialist: { select: { userId: true } },
    },
  });
  if (!submission) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = submission.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  await prisma.$transaction([
    prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'VERIFIED',
        rejectionReason: null,
        reviewerId: parsed.data.reviewerId ?? null,
        reviewedAt: new Date(),
      },
    }),
    prisma.specialistProfile.update({
      where: { id: submission.specialistId },
      data: { kycStatus: 'VERIFIED' },
    }),
  ]);

  try {
    await notifyKycStatus({ userId, status: 'VERIFIED', submissionId });
  } catch (e) {
    console.warn('[admin] notifyKycStatus VERIFIED failed', e);
  }

  return res.json({ ok: true, submissionId, status: 'VERIFIED' });
});

/** PATCH /admin/kyc/:submissionId/reject */
adminRouter.patch('/kyc/:submissionId/reject', async (req, res) => {
  const submissionId = String(req.params.submissionId ?? '').trim();
  if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId_required' });

  const parsed = RejectKycSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const submission = await prisma.kycSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      specialistId: true,
      specialist: { select: { userId: true } },
    },
  });
  if (!submission) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = submission.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  await prisma.$transaction([
    prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        rejectionReason: parsed.data.reason,
        reviewerId: parsed.data.reviewerId ?? null,
        reviewedAt: new Date(),
      },
    }),
    prisma.specialistProfile.update({
      where: { id: submission.specialistId },
      data: { kycStatus: 'REJECTED' },
    }),
  ]);

  try {
    await notifyKycStatus({
      userId,
      status: 'REJECTED',
      reason: parsed.data.reason,
      submissionId,
    });
  } catch (e) {
    console.warn('[admin] notifyKycStatus REJECTED failed', e);
  }

  return res.json({ ok: true, submissionId, status: 'REJECTED' });
});

/**
 * ✅ helper push (mismo patrón que orders.routes)
 * (se usa para grant-days)
 */
async function pushToUser(params: { userId: string; title: string; body: string; data: any }) {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: params.userId, enabled: true },
    select: { token: true },
  });

  const toList = tokens.map((t) => t.token).filter(Boolean);
  if (!toList.length) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[push] no tokens for user', params.userId);
    }
    return;
  }

  await sendExpoPush(
    toList.map((to) => ({
      to,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      title: params.title,
      body: params.body,
      data: params.data,
    })),
  );
}

/**
 * ✅ CERTIFICACIONES ADMIN
 */

const ApproveCertSchema = z.object({
  reviewerId: z.string().optional().nullable(),
});

const RejectCertSchema = z.object({
  reason: z.string().min(2).max(500),
  reviewerId: z.string().optional().nullable(),
});

/**
 * ✅ ANTECEDENTES (BACKGROUND CHECK) ADMIN
 */

const ApproveBgSchema = z.object({
  reviewerId: z.string().optional().nullable(),
});

const RejectBgSchema = z.object({
  reason: z.string().min(2).max(500),
  reviewerId: z.string().optional().nullable(),
});

/** GET /admin/background-checks/pending */
adminRouter.get('/background-checks/pending', async (_req, res) => {
  const items = await prisma.specialistBackgroundCheck.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      status: true,
      fileUrl: true,
      createdAt: true,

      reviewerId: true,
      rejectionReason: true,
      reviewedAt: true,

      specialistId: true,
      specialist: {
        select: {
          userId: true,
          user: { select: { email: true, name: true, surname: true } },
        },
      },
    },
  });

  return res.json({
    ok: true,
    count: items.length,
    items: items.map((x) => ({
      id: x.id,
      status: x.status,
      fileUrl: toAbsoluteUrl(x.fileUrl),
      createdAt: x.createdAt.toISOString(),

      reviewerId: x.reviewerId ?? null,
      rejectionReason: x.rejectionReason ?? null,
      reviewedAt: x.reviewedAt ? x.reviewedAt.toISOString() : null,

      specialistId: x.specialistId,
      userId: x.specialist?.userId ?? null,
      email: x.specialist?.user?.email ?? null,
      name: `${x.specialist?.user?.name ?? ''} ${x.specialist?.user?.surname ?? ''}`.trim() || null,
    })),
  });
});

/** PATCH /admin/background-checks/:id/approve */
adminRouter.patch('/background-checks/:id/approve', async (req, res) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  const parsed = ApproveBgSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      fileUrl: true,
      specialist: { select: { userId: true } },
    },
  });
  if (!bg) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = bg.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  const result = await prisma.specialistBackgroundCheck.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      reviewerId: parsed.data.reviewerId ?? null,
      rejectionReason: null,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ ok: false, error: 'already_reviewed' });
  }

  try {
    await notifyBackgroundCheckStatus({
      userId,
      status: 'APPROVED',
      backgroundCheckId: id,
      fileUrl: bg.fileUrl ?? null,
    });
  } catch (e) {
    console.warn('[admin] notifyBackgroundCheckStatus APPROVED failed', e);
  }

  return res.json({ ok: true, id, status: 'APPROVED' });
});

/** PATCH /admin/background-checks/:id/reject */
adminRouter.patch('/background-checks/:id/reject', async (req, res) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  const parsed = RejectBgSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      fileUrl: true,
      specialist: { select: { userId: true } },
    },
  });
  if (!bg) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = bg.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  const result = await prisma.specialistBackgroundCheck.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      reviewerId: parsed.data.reviewerId ?? null,
      rejectionReason: parsed.data.reason,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ ok: false, error: 'already_reviewed' });
  }

  try {
    await notifyBackgroundCheckStatus({
      userId,
      status: 'REJECTED',
      reason: parsed.data.reason,
      backgroundCheckId: id,
      fileUrl: bg.fileUrl ?? null,
    });
  } catch (e) {
    console.warn('[admin] notifyBackgroundCheckStatus REJECTED failed', e);
  }

  return res.json({ ok: true, id, status: 'REJECTED', rejectionReason: parsed.data.reason });
});

/** POST /admin/background-checks/:id/request-update */
adminRouter.post('/background-checks/:id/request-update', async (req, res) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { id },
    select: {
      id: true,
      specialistId: true,
      specialist: { select: { userId: true } },
      status: true,
      fileUrl: true,
    },
  });

  if (!bg) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = bg.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  const title = 'Actualización de antecedentes';
  const body =
    'Necesitamos que actualices tu certificado de antecedentes. Subí uno nuevo desde la app.';

  const notif = await prisma.notification.create({
    data: {
      userId,
      type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
      title,
      body,
      data: { backgroundCheckId: id } as any,
    },
    select: { id: true, title: true, body: true },
  });

  try {
    await pushToUser({
      userId,
      title: notif.title ?? title,
      body: notif.body ?? body,
      data: {
        notificationId: notif.id,
        type: 'BACKGROUND_CHECK_REVIEW_REQUEST',
        backgroundCheckId: id,
      },
    });
  } catch (e) {
    console.warn('[push] BACKGROUND_CHECK_REVIEW_REQUEST failed', e);
  }

  return res.json({ ok: true, id, notificationId: notif.id });
});

/** PATCH /admin/background-checks/:id/expire */
adminRouter.patch('/background-checks/:id/expire', async (req, res) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      fileUrl: true,
      specialistId: true,
      specialist: { select: { userId: true } },
    },
  });

  if (!bg) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = bg.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  const reason = 'Vencido: por favor subí un antecedente actualizado.';

  const result = await prisma.specialistBackgroundCheck.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      reviewedAt: new Date(),
      reviewerId: (req as any).admin?.sub ?? null,
    },
    select: { id: true, status: true, rejectionReason: true, reviewedAt: true },
  });

  await prisma.specialistProfile.update({
    where: { id: bg.specialistId },
    data: { availableNow: false },
  });

  try {
    await notifyBackgroundCheckStatus({
      userId,
      status: 'REJECTED',
      reason,
      backgroundCheckId: id,
      fileUrl: bg.fileUrl ?? null,
    });
  } catch (e) {
    console.warn('[admin] notifyBackgroundCheckStatus EXPIRE failed', e);
  }

  return res.json({
    ok: true,
    id: result.id,
    status: result.status,
    rejectionReason: result.rejectionReason,
  });
});

/** GET /admin/certifications/pending */
adminRouter.get('/certifications/pending', async (_req, res) => {
  const items = await prisma.specialistCertification.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      status: true,
      fileUrl: true,
      number: true,
      issuer: true,
      expiresAt: true,
      createdAt: true,

      reviewerId: true,
      rejectionReason: true,
      reviewedAt: true,

      category: { select: { id: true, name: true, slug: true } },
      specialist: {
        select: {
          id: true,
          userId: true,
          user: { select: { email: true, name: true, surname: true } },
        },
      },
    },
  });

  return res.json({
    ok: true,
    count: items.length,
    items: items.map((c) => ({
      id: c.id,
      status: c.status,
      fileUrl: toAbsoluteUrl(c.fileUrl),
      number: c.number ?? null,
      issuer: c.issuer ?? null,
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),

      reviewerId: c.reviewerId ?? null,
      rejectionReason: c.rejectionReason ?? null,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,

      category: c.category
        ? { id: c.category.id, name: c.category.name, slug: c.category.slug }
        : null,
      specialist: c.specialist
        ? {
            id: c.specialist.id,
            userId: c.specialist.userId,
            email: c.specialist.user?.email ?? null,
            name:
              `${c.specialist.user?.name ?? ''} ${c.specialist.user?.surname ?? ''}`.trim() || null,
          }
        : null,
    })),
  });
});

/** PATCH /admin/certifications/:certId/approve */
adminRouter.patch('/certifications/:certId/approve', async (req, res) => {
  const certId = String(req.params.certId ?? '').trim();
  if (!certId) return res.status(400).json({ ok: false, error: 'certId_required' });

  const parsed = ApproveCertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const cert = await prisma.specialistCertification.findUnique({
    where: { id: certId },
    select: {
      id: true,
      status: true,
      specialist: { select: { userId: true } },
      category: { select: { slug: true, name: true } },
    },
  });
  if (!cert) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = cert.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  const result = await prisma.specialistCertification.updateMany({
    where: { id: certId, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      reviewerId: parsed.data.reviewerId ?? null,
      rejectionReason: null,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ ok: false, error: 'already_reviewed' });
  }

  const updated = await prisma.specialistCertification.findUnique({
    where: { id: certId },
    select: { id: true, status: true, reviewedAt: true },
  });

  try {
    await notifyCertificationStatus({
      userId,
      status: 'APPROVED',
      certificationId: certId,
      categorySlug: cert.category?.slug ?? null,
      categoryName: cert.category?.name ?? null,
    });
  } catch (e) {
    console.warn('[admin] notifyCertificationStatus APPROVED failed', e);
  }

  return res.json({
    ok: true,
    certId: updated?.id ?? certId,
    status: updated?.status ?? 'APPROVED',
    reviewedAt: updated?.reviewedAt ? updated.reviewedAt.toISOString() : null,
  });
});

/** PATCH /admin/certifications/:certId/reject */
adminRouter.patch('/certifications/:certId/reject', async (req, res) => {
  const certId = String(req.params.certId ?? '').trim();
  if (!certId) return res.status(400).json({ ok: false, error: 'certId_required' });

  const parsed = RejectCertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  const cert = await prisma.specialistCertification.findUnique({
    where: { id: certId },
    select: {
      id: true,
      status: true,
      specialist: { select: { userId: true } },
      category: { select: { slug: true, name: true } },
    },
  });
  if (!cert) return res.status(404).json({ ok: false, error: 'not_found' });

  const userId = cert.specialist?.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'user_not_found' });

  const result = await prisma.specialistCertification.updateMany({
    where: { id: certId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      reviewerId: parsed.data.reviewerId ?? null,
      rejectionReason: parsed.data.reason,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return res.status(409).json({ ok: false, error: 'already_reviewed' });
  }

  const updated = await prisma.specialistCertification.findUnique({
    where: { id: certId },
    select: { id: true, status: true, reviewedAt: true, rejectionReason: true },
  });

  try {
    await notifyCertificationStatus({
      userId,
      status: 'REJECTED',
      certificationId: certId,
      categorySlug: cert.category?.slug ?? null,
      categoryName: cert.category?.name ?? null,
      reason: parsed.data.reason,
    });
  } catch (e) {
    console.warn('[admin] notifyCertificationStatus REJECTED failed', e);
  }

  return res.json({
    ok: true,
    certId: updated?.id ?? certId,
    status: updated?.status ?? 'REJECTED',
    rejectionReason: updated?.rejectionReason ?? parsed.data.reason,
    reviewedAt: updated?.reviewedAt ? updated.reviewedAt.toISOString() : null,
  });
});

/**
 * PATCH /admin/specialists/:specialistId/grant-days
 * Body: { days: number }
 */
adminRouter.patch('/specialists/:specialistId/grant-days', async (req, res) => {
  const { specialistId } = req.params;
  const days = Number(req.body?.days ?? 0);

  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    return res.status(400).json({ message: 'days inválido (1..365)' });
  }

  const spec = await prisma.specialistProfile.findUnique({
    where: { id: specialistId },
    include: {
      user: { select: { id: true, name: true, surname: true } },
      subscription: true,
    },
  });

  if (!spec) return res.status(404).json({ message: 'Especialista no encontrado' });

  const ms = days * 24 * 60 * 60 * 1000;
  const now = new Date();

  let updatedSub: {
    id: string;
    status: any;
    trialEnd: Date | null;
    currentPeriodEnd: Date;
    currentPeriodStart: Date;
  } | null = null;

  if (!spec.subscription) {
    updatedSub = await prisma.subscription.create({
      data: {
        specialistId,
        status: 'TRIALING',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + ms),
        trialEnd: new Date(now.getTime() + ms),
      },
      select: {
        id: true,
        status: true,
        trialEnd: true,
        currentPeriodEnd: true,
        currentPeriodStart: true,
      },
    });
  } else {
    const sub = spec.subscription;

    if (sub.status === 'TRIALING' && sub.trialEnd) {
      updatedSub = await prisma.subscription.update({
        where: { specialistId },
        data: { trialEnd: new Date(sub.trialEnd.getTime() + ms) },
        select: {
          id: true,
          status: true,
          trialEnd: true,
          currentPeriodEnd: true,
          currentPeriodStart: true,
        },
      });
    } else {
      const baseEnd = sub.currentPeriodEnd ?? now;
      updatedSub = await prisma.subscription.update({
        where: { specialistId },
        data: { currentPeriodEnd: new Date(baseEnd.getTime() + ms) },
        select: {
          id: true,
          status: true,
          trialEnd: true,
          currentPeriodEnd: true,
          currentPeriodStart: true,
        },
      });
    }
  }

  const fullName = `${spec.user?.name ?? ''} ${spec.user?.surname ?? ''}`.trim();
  const title = '¡Felicitaciones! Ganaste días extra 🎉';
  const body =
    days === 1
      ? `Se te acreditó 1 día extra en tu suscripción.`
      : `Se te acreditaron ${days} días extra en tu suscripción.`;

  const notif = await prisma.notification.create({
    data: {
      userId: spec.userId,
      type: 'SUBSCRIPTION_DAYS_GRANTED',
      title,
      body,
      data: {
        specialistId,
        subscriptionId: updatedSub?.id ?? null,
        daysGranted: days,
        newTrialEnd: updatedSub?.trialEnd ? updatedSub.trialEnd.toISOString() : null,
        newPeriodEnd: updatedSub?.currentPeriodEnd
          ? updatedSub.currentPeriodEnd.toISOString()
          : null,
      } as any,
    },
    select: { id: true, title: true, body: true },
  });

  try {
    await pushToUser({
      userId: spec.userId,
      title: notif.title ?? title,
      body: notif.body ?? body,
      data: {
        notificationId: notif.id,
        type: 'SUBSCRIPTION_DAYS_GRANTED',
        specialistId,
        daysGranted: days,
        subscriptionId: updatedSub?.id ?? null,
      },
    });
  } catch (e) {
    console.warn('[push] SUBSCRIPTION_DAYS_GRANTED failed', e);
  }

  return res.json({
    ok: true,
    subscription: {
      id: updatedSub?.id ?? null,
      status: updatedSub?.status ?? null,
      trialEnd: updatedSub?.trialEnd ? updatedSub.trialEnd.toISOString() : null,
      currentPeriodEnd: updatedSub?.currentPeriodEnd
        ? updatedSub.currentPeriodEnd.toISOString()
        : null,
      currentPeriodStart: updatedSub?.currentPeriodStart
        ? updatedSub.currentPeriodStart.toISOString()
        : null,
    },
    notificationId: notif.id,
    daysGranted: days,
    specialist: {
      id: specialistId,
      name: fullName || null,
      userId: spec.userId,
    },
  });
});

/**
 * DELETE /admin/users/:userId
 */
adminRouter.delete('/users/:userId', requireAdmin, async (req, res) => {
  const userId = String(req.params.userId ?? '').trim();
  const mode = String(req.query.mode ?? 'anonymize').trim(); // anonymize | hard

  if (!userId) return res.status(400).json({ ok: false, error: 'userId_required' });
  if (!['anonymize', 'hard'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'invalid_mode' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      specialist: { select: { id: true } },
    },
  });

  if (!user) return res.status(404).json({ ok: false, error: 'not_found' });

  const oldEmail = user.email;
  const specialistId = user.specialist?.id ?? null;

  if (mode === 'anonymize') {
    const newEmail = `deleted+${Date.now()}_${userId}@deleted.local`.toLowerCase();

    await prisma.$transaction(async (tx) => {
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: {
          email: newEmail,
          status: 'BLOCKED',
          name: user.role === 'ADMIN' ? 'Admin' : 'Deleted',
          surname: null,
        },
      });

      if (specialistId) {
        await tx.specialistProfile
          .update({
            where: { id: specialistId },
            data: { kycStatus: 'UNVERIFIED' },
          })
          .catch(() => {});
      }
    });

    return res.json({ ok: true, mode, userId, oldEmail, newEmail });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });

      if (specialistId) {
        await tx.kycSubmission.deleteMany({ where: { specialistId } }).catch(() => {});
        await tx.specialistCertification.deleteMany({ where: { specialistId } }).catch(() => {});
        await tx.subscription.deleteMany({ where: { specialistId } }).catch(() => {});

        await (tx as any).specialistSpecialty
          ?.deleteMany?.({ where: { specialistId } })
          .catch(() => {});

        await tx.specialistProfile.delete({ where: { id: specialistId } }).catch(() => {});
      }

      await tx.user.delete({ where: { id: userId } });
    });

    return res.json({ ok: true, mode, userId, oldEmail });
  } catch (e: any) {
    console.warn('[admin delete user] hard delete failed:', e?.message ?? e);
    return res.status(409).json({
      ok: false,
      error: 'hard_delete_failed',
      message:
        'No se pudo hacer hard delete (probables FKs). Usá mode=anonymize para liberar el email sin riesgo.',
    });
  }
});

export default adminRouter;
