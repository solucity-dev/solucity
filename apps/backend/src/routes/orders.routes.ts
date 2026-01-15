// apps/backend/src/routes/orders.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';
import {
  cancelBySpecialistSchema,
  cancelOrderSchema,
  confirmOrderSchema,
  createOrderSchema,
  finishOrderSchema,
  rateOrderSchema,
  rejectOrderSchema,
  rescheduleOrderSchema,
} from '../schemas/orders';
import { deleteChatForOrder } from '../services/chatCleanup';
import { geocodeAddress } from '../services/geocode';
import { sendExpoPush } from '../services/pushExpo';
import { haversineKm } from '../utils/distance';

import type { Prisma } from '@prisma/client';

// Schemas existentes

// 👉 TIPOS Prisma/Enums (solo tipos, sin importar valores)
type OrderStatus = import('@prisma/client').$Enums.OrderStatus;

export const orders = Router();

/* ───────────────────────── Helpers ───────────────────────── */
const now = () => new Date();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const headerUserId = (req: import('express').Request) =>
  String(req.header('x-user-id') || '').trim() || null;

// Prioriza `auth`; si no hay user, intenta x-user-id (compat)
function getActorUserId(req: any): string | null {
  return (req.user?.id as string | undefined) ?? headerUserId(req);
}

// Estados abiertos/cerrados
const OPEN_STATUSES: OrderStatus[] = [
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'PAUSED',
  'FINISHED_BY_SPECIALIST',
  'IN_CLIENT_REVIEW',
  'CONFIRMED_BY_CLIENT',
];
// ✅ Nota: CANCELLED_AUTO (vencidas por deadline) NO se muestran en Agenda.
// Se mantienen en DB para histórico/auditoría.
const CLOSED_STATUSES: OrderStatus[] = [
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_SPECIALIST',
  // 'CANCELLED_AUTO',  // 👈 ocultar vencidas
  'CLOSED',
];

// Fallback constante
const CANCELLED_BY_SPECIALIST: OrderStatus = 'CANCELLED_BY_SPECIALIST';

// Lookups
async function getCustomerUserId(customerProfileId: string): Promise<string | null> {
  const c = await prisma.customerProfile.findUnique({
    where: { id: customerProfileId },
    select: { userId: true },
  });
  return c?.userId ?? null;
}
async function getSpecialistUserId(specialistProfileId: string): Promise<string | null> {
  const s = await prisma.specialistProfile.findUnique({
    where: { id: specialistProfileId },
    select: { userId: true },
  });
  return s?.userId ?? null;
}
async function resolveActorUserId(
  order: { specialistId: string | null; customerId: string },
  headerUid?: string | null,
) {
  if (headerUid) return headerUid;
  if (order.specialistId) {
    const uid = await getSpecialistUserId(order.specialistId);
    if (uid) return uid;
  }
  return await getCustomerUserId(order.customerId);
}

// 👇 Helper para sumar trabajos cancelados del especialista
async function bumpSpecialistCanceledStats(specialistId: string) {
  try {
    await prisma.specialistProfile.update({
      where: { id: specialistId },
      data: {
        statsCanceled: { increment: 1 },
      },
    });
  } catch (e) {
    console.warn('[statsCanceled] failed to increment for specialist', {
      specialistId,
      error: e,
    });
  }
}

// ✅ NUEVO: helper para enviar push a un user (usa pushTokens en DB)
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

// 👇 opcional: si más adelante creás un user "System", ponés su id aquí en .env
const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_ID || '';

async function addEvent(
  orderId: string,
  actorUserId: string | null,
  type: string,
  payload?: Prisma.InputJsonValue | null,
) {
  const finalActorId = actorUserId && actorUserId !== 'system' ? actorUserId : SYSTEM_ACTOR_ID;

  if (!finalActorId) {
    console.warn('[addEvent] SYSTEM_ACTOR_ID missing for system event', {
      orderId,
      type,
    });
    // evitamos romper producción:
    return;
  }

  await prisma.orderEvent.create({
    data: {
      orderId,
      actorId: finalActorId, // ✅ SIEMPRE string real
      type,
      payload: (payload ?? null) as any,
    },
  });
}

/* ─────────────────── ✅ Auto-cancel por deadline vencido ─────────────────── */
async function autoCancelExpiredPendingOrders() {
  const expired = await prisma.serviceOrder.findMany({
    where: {
      status: 'PENDING',
      acceptDeadlineAt: { lt: new Date() },
    },
    select: {
      id: true,
      acceptDeadlineAt: true,
      customerId: true,
      specialistId: true,
    },
  });

  if (expired.length === 0) return;

  await prisma.serviceOrder.updateMany({
    where: { id: { in: expired.map((e) => e.id) } },
    data: { status: 'CANCELLED_AUTO' },
  });

  for (const o of expired) {
    await addEvent(o.id, 'system', 'CANCELLED_AUTO', {
      reason: 'accept_deadline_expired',
      deadlineAt: o.acceptDeadlineAt,
    } as any);

    // notificar cliente
    const customerUserId = await getCustomerUserId(o.customerId);
    if (customerUserId) {
      await prisma.notification.create({
        data: {
          userId: customerUserId,
          type: 'ORDER_CANCELLED_AUTO',
          title: 'Solicitud vencida',
          body: 'La solicitud se canceló automáticamente porque venció el tiempo de aceptación.',
          data: { orderId: o.id } as any,
        },
      });
    }

    // notificar especialista si había uno preasignado
    if (o.specialistId) {
      const specialistUserId = await getSpecialistUserId(o.specialistId);
      if (specialistUserId) {
        await prisma.notification.create({
          data: {
            userId: specialistUserId,
            type: 'ORDER_CANCELLED_AUTO',
            title: 'Solicitud vencida',
            body: 'Una solicitud pendiente fue cancelada automáticamente por falta de aceptación.',
            data: { orderId: o.id } as any,
          },
        });
      }
    }
  }
}

// 👇 Export público para poder correr el autocancel desde server.ts
export async function runAutoCancelExpiredPendingOrders() {
  await autoCancelExpiredPendingOrders();
}

// ✅ ID helper local (cuid2 o cuid clásico)
const id = z.string().cuid2().or(z.string().cuid());

/* ─────────────────── Payload “simple” opcional ─────────────────── */
// ✅ ahora address acepta string o {formatted}
const createOrderSimple = z.object({
  specialistId: z.string().min(1),

  // ✅ CLAVE: si el mobile manda serviceId, lo respetamos
  serviceId: id.optional(),

  description: z.string().optional(),
  attachments: z.array(z.any()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  preferredAt: z.string().datetime().optional().nullable(),
  isUrgent: z.boolean().optional().default(false),
  address: z.union([z.string(), z.object({ formatted: z.string().optional() })]).optional(),
});

/* ───────────────────────── Rutas ───────────────────────── */

// POST /orders  (crear solicitud — cliente)
orders.post('/', auth, async (req, res) => {
  // Valida “full”, sino “simple”
  let parsed:
    | { mode: 'full'; data: any }
    | { mode: 'simple'; data: z.infer<typeof createOrderSimple> };

  const full = createOrderSchema.safeParse(req.body);
  if (full.success) parsed = { mode: 'full', data: full.data };
  else {
    const simple = createOrderSimple.safeParse(req.body);
    if (!simple.success) {
      return res.status(400).json({ ok: false, error: full.error.flatten() });
    }
    parsed = { mode: 'simple', data: simple.data };
  }

  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  try {
    // 1) customerId + ubicación por defecto si no viene
    let customerId: string | null =
      parsed.mode === 'full' ? (parsed.data.customerId ?? null) : null;
    let locationId: string | null =
      parsed.mode === 'full' ? (parsed.data.locationId ?? null) : null;

    if (!customerId) {
      const cust = await prisma.customerProfile.findUnique({
        where: { userId: uid },
        select: { id: true, defaultAddressId: true },
      });
      if (!cust) return res.status(400).json({ ok: false, error: 'user_not_customer' });
      customerId = cust.id;
      locationId = locationId ?? cust.defaultAddressId ?? null;
    }

    // ✅ addressText: tomamos dirección manual directamente del body
    const rawAddressInput = (req.body as any)?.address ?? (req.body as any)?.addressText;

    const addressText =
      typeof rawAddressInput === 'string'
        ? rawAddressInput.trim()
        : typeof rawAddressInput?.formatted === 'string'
          ? rawAddressInput.formatted.trim()
          : null;

    // ⚠️ IMPORTANTE:
    // NO creamos Address si ya viene locationId.
    // Tu Address exige lat/lng, así que si no podemos geocodificar
    // se guarda solamente en addressText.

    let finalLocationId = locationId;

    // 🔍 ÚNICO bloque de geocode
    if (!finalLocationId && addressText) {
      try {
        const geo = await geocodeAddress(addressText);

        if (geo) {
          const formatted =
            typeof geo.formatted === 'string' && geo.formatted.trim()
              ? geo.formatted.trim()
              : addressText; // 👈 fallback: usamos lo que escribió el usuario

          const newAddr = await prisma.address.create({
            data: {
              formatted,
              lat: geo.lat,
              lng: geo.lng,
              placeId: geo.placeId ?? null,
            },
            select: { id: true },
          });

          finalLocationId = newAddr.id;
          // ✅ NO borramos addressText: lo dejamos como respaldo
        }
      } catch (e) {
        console.warn('[POST /orders] geocode failed', e);
        // fallback: queda addressText plano
      }
    }

    // 2) serviceId (si no viene, inferir desde rubro principal del especialista)
    let serviceId: string | null =
      parsed.mode === 'full'
        ? (parsed.data.serviceId ?? null)
        : ((parsed.data as any).serviceId ?? null);

    const specialistId: string | null =
      parsed.mode === 'full' ? (parsed.data.specialistId ?? null) : parsed.data.specialistId;

    if (!serviceId) {
      if (!specialistId) {
        return res.status(400).json({ ok: false, error: 'missing_specialist_to_resolve_service' });
      }
      const spec = await prisma.specialistProfile.findUnique({
        where: { id: specialistId },
        select: { specialties: { select: { categoryId: true }, take: 1 } },
      });
      if (!spec) return res.status(404).json({ ok: false, error: 'specialist_not_found' });
      const primaryCategoryId = spec.specialties[0]?.categoryId;
      if (!primaryCategoryId) {
        return res.status(409).json({ ok: false, error: 'specialist_without_category' });
      }

      const service = await prisma.service.upsert({
        where: {
          categoryId_name: { categoryId: primaryCategoryId, name: 'Visita técnica' },
        },
        update: {},
        create: {
          categoryId: primaryCategoryId,
          name: 'Visita técnica',
          description: 'Diagnóstico y presupuesto en sitio',
          basePoints: 10,
          slaHours: 24,
          basePrice: null,
        },
        select: { id: true },
      });
      serviceId = service.id;
    }

    console.log('[POST /orders] mode =', parsed.mode);
    console.log('[POST /orders] incoming serviceId(body) =', (req.body as any)?.serviceId);
    console.log(
      '[POST /orders] parsed serviceId =',
      parsed.mode === 'full' ? parsed.data.serviceId : null,
    );
    console.log('[POST /orders] final serviceId (used) =', serviceId);
    console.log('[POST /orders] incoming categorySlug(body) =', (req.body as any)?.categorySlug);

    // 3) tiempos/reglas
    const isUrgent = parsed.data.isUrgent ?? false;
    const preferredAtStr =
      parsed.mode === 'full' ? parsed.data.preferredAt : parsed.data.preferredAt;
    const scheduledAtStr =
      parsed.mode === 'full' ? parsed.data.scheduledAt : parsed.data.scheduledAt;
    if (!isUrgent && !preferredAtStr && !scheduledAtStr) {
      return res.status(400).json({ ok: false, error: 'prefer_or_schedule_required' });
    }

    const preferredAt = preferredAtStr ? new Date(preferredAtStr) : null;
    const scheduledAt = scheduledAtStr ? new Date(scheduledAtStr) : null;
    // ⏱ 2 horas de límite
    const acceptDeadlineAt = addMinutes(now(), 120);

    // 3.bis) Normalizar adjuntos a { type, url }
    const rawAttachments = Array.isArray(parsed.data.attachments) ? parsed.data.attachments : [];

    const normalizedAttachments = rawAttachments
      .map((a: any) => {
        if (!a) return null;
        const url = a.url ?? a.uri ?? a.fileUrl ?? null;
        if (!url || typeof url !== 'string') return null;
        return {
          type: a.type ?? 'image',
          url,
        };
      })
      .filter(Boolean);

    // 4) crear
    const order = await prisma.serviceOrder.create({
      data: {
        customerId: customerId!,
        specialistId: specialistId ?? null,
        serviceId: serviceId!,
        locationId: finalLocationId ?? null,
        addressText: addressText || null,

        description: parsed.data.description ?? null,
        attachments: normalizedAttachments.length ? (normalizedAttachments as any) : null,
        preferredAt,
        scheduledAt,
        isUrgent,
        status: 'PENDING',
        acceptDeadlineAt,
      },
    });

    // evento CREATED
    const preassignedUserId = order.specialistId
      ? await getSpecialistUserId(order.specialistId)
      : null;
    await addEvent(order.id, uid, 'CREATED', {
      isUrgent,
      preferredAt: preferredAtStr ?? null,
      scheduledAt: scheduledAtStr ?? null,
      preassignedSpecialistUserId: preassignedUserId,
    } as any);

    // ✅ CAMBIO: ORDER_CREATED ahora manda push con notificationId
    if (order.specialistId) {
      const specialistUserId = await getSpecialistUserId(order.specialistId);

      if (specialistUserId) {
        const [custUser, serviceInfo] = await Promise.all([
          prisma.customerProfile.findUnique({
            where: { id: order.customerId },
            select: { user: { select: { name: true, surname: true } } },
          }),
          prisma.service.findUnique({
            where: { id: order.serviceId },
            select: { category: { select: { name: true } } },
          }),
        ]);

        const customerName =
          `${custUser?.user?.name ?? 'Un cliente'} ${custUser?.user?.surname ?? ''}`.trim();

        const rubroName = serviceInfo?.category?.name ?? 'un rubro';

        // 1) Guardar notificación en DB
        const notif = await prisma.notification.create({
          data: {
            userId: specialistUserId,
            type: 'ORDER_CREATED',
            title: 'Nueva solicitud de trabajo',
            body: `${customerName} solicitó ${rubroName}.`,
            data: {
              orderId: order.id,
              customerName,
              categoryName: rubroName,
            } as any,
          },
          select: { id: true, title: true, body: true },
        });

        // 2) PUSH REAL al especialista + notificationId
        try {
          await pushToUser({
            userId: specialistUserId,
            title: notif.title ?? 'Nueva solicitud de trabajo',
            body: notif.body ?? `${customerName} solicitó ${rubroName}.`,
            data: {
              notificationId: notif.id, // ✅ CLAVE para marcar read desde el tap
              type: 'ORDER_CREATED',
              orderId: order.id,
              customerName,
              categoryName: rubroName,
            },
          });
        } catch (e) {
          console.warn('[push] ORDER_CREATED failed', e);
        }
      }
    }

    return res.status(201).json({ ok: true, order });
  } catch (e) {
    console.error('[POST /orders] error', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /orders/mine?role=customer|specialist&status=open|closed
orders.get('/mine', auth, async (req: any, res) => {
  try {
    await autoCancelExpiredPendingOrders(); // ✅ autocancel masivo

    const uid = getActorUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const role = (req.query.role as 'customer' | 'specialist') ?? 'customer';
    const isClosed = (req.query.status as string) === 'closed';
    const byStatuses = isClosed ? CLOSED_STATUSES : OPEN_STATUSES;

    const whereByRole =
      role === 'specialist' ? { specialist: { userId: uid } } : { customer: { userId: uid } };

    const rows = await prisma.serviceOrder.findMany({
      where: { ...whereByRole, status: { in: byStatuses } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        scheduledAt: true,
        preferredAt: true,
        agreedPrice: true,
        addressText: true,

        service: {
          select: {
            id: true,
            name: true,
            category: { select: { name: true, slug: true } }, // ✅ NUEVO
          },
        },

        specialist: {
          select: {
            id: true,
            user: { select: { name: true, surname: true } },
          },
        },

        customer: {
          select: {
            id: true,
            user: { select: { name: true } },
          },
        },

        location: { select: { formatted: true } },

        // 👇 NUEVO: incluir rating
        rating: {
          select: {
            score: true,
            comment: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const list = rows.map((o) => {
      const resolvedAddress =
        typeof o.location?.formatted === 'string' && o.location.formatted.trim()
          ? o.location.formatted.trim()
          : typeof o.addressText === 'string' && o.addressText.trim()
            ? o.addressText.trim()
            : null;

      return {
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        scheduledAt: o.scheduledAt,
        preferredAt: o.preferredAt,
        price: o.agreedPrice ?? null,

        service: {
          id: o.service.id,
          name: o.service.name,
          categoryName: o.service.category?.name ?? null, // ✅ NUEVO
          categorySlug: o.service.category?.slug ?? null, // ✅ opcional
        },

        specialist: o.specialist
          ? {
              id: o.specialist.id,
              name: `${o.specialist.user.name ?? 'Especialista'}`,
            }
          : null,

        customer: o.customer
          ? {
              id: o.customer.id,
              name: `${o.customer.user.name ?? 'Cliente'}`,
            }
          : null,

        address: o.status === 'PENDING' ? null : resolvedAddress,

        // 👇 NUEVO: rating simplificada para la lista
        rating: o.rating
          ? {
              score: o.rating.score,
              comment: o.rating.comment,
            }
          : null,
      };
    });

    return res.json({ ok: true, orders: list });
  } catch (e) {
    console.error('GET /orders/mine', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /orders/:id/accept  (especialista)
orders.post('/:id/accept', auth, async (req, res) => {
  const orderId = req.params.id;

  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  // Intentar obtener specialistId desde el body (compatibilidad)
  let specialistId: string | undefined = (req.body as any)?.specialistId;

  // Si no viene en el body, lo resolvemos por el userId logueado
  if (!specialistId) {
    const spec = await prisma.specialistProfile.findUnique({
      where: { userId: uid },
      select: { id: true },
    });
    if (!spec) {
      return res.status(403).json({ ok: false, error: 'only_specialist_can_accept' });
    }
    specialistId = spec.id;
  }

  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
  if (order.status !== 'PENDING') return res.status(409).json({ ok: false, error: 'not_pending' });
  if (order.acceptDeadlineAt && order.acceptDeadlineAt < now()) {
    return res.status(409).json({ ok: false, error: 'deadline_expired' });
  }
  if (order.specialistId && order.specialistId !== specialistId) {
    return res.status(403).json({ ok: false, error: 'assigned_to_other' });
  }

  const sub = await prisma.subscription.findUnique({
    where: { specialistId },
  });
  if (!sub || (sub.status !== 'TRIALING' && sub.status !== 'ACTIVE')) {
    return res.status(402).json({ ok: false, error: 'subscription_inactive' });
  }

  // ✅ 1) actualizamos estado + asignamos especialista
  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { specialistId, status: 'ASSIGNED' },
  });

  // ✅ 2) evento ACCEPTED
  const actorUid = uid ?? (await getSpecialistUserId(specialistId)) ?? 'system';
  await addEvent(orderId, actorUid, 'ACCEPTED');

  // ✅ CAMBIO: notificar al cliente (DB + PUSH con notificationId)
  try {
    const customerUserId = await getCustomerUserId(order.customerId);
    if (customerUserId) {
      const notif = await prisma.notification.create({
        data: {
          userId: customerUserId,
          type: 'ORDER_ACCEPTED',
          title: 'Solicitud aceptada',
          body: 'Un especialista aceptó tu pedido. Ya pueden coordinar por chat.',
          data: { orderId } as any,
        },
        select: { id: true, title: true, body: true },
      });

      // ✅ PUSH REAL al cliente
      await pushToUser({
        userId: customerUserId,
        title: notif.title ?? 'Solicitud aceptada',
        body: notif.body ?? 'Un especialista aceptó tu pedido. Ya pueden coordinar por chat.',
        data: {
          notificationId: notif.id, // ✅ CLAVE
          type: 'ORDER_ACCEPTED',
          orderId,
        },
      });
    }
  } catch (e) {
    console.warn('[ACCEPT] notify customer failed', e);
  }

  // ✅ B) crear chat thread si no existe
  try {
    const existingThread = await prisma.chatThread.findFirst({
      where: { orderId: order.id },
      select: { id: true },
    });

    if (!existingThread) {
      await prisma.chatThread.create({
        data: {
          orderId: order.id,
        } as any,
      });
    }
  } catch (e) {
    console.warn('[ACCEPT] chatThread create failed (check schema fields)', e);
  }

  return res.json({ ok: true, order: updated });
});

/* ───────────────────────── resto de rutas SIN CAMBIOS ───────────────────────── */
// POST /orders/:id/reschedule
orders.post('/:id/reschedule', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = rescheduleOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });
  const { scheduledAt, reason } = parse.data;

  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(order.status as OrderStatus)) {
    return res.status(409).json({ ok: false, error: 'invalid_state' });
  }

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { scheduledAt: new Date(scheduledAt) },
  });

  const actorUid = await resolveActorUserId(order, getActorUserId(req));
  if (!actorUid) return res.status(400).json({ ok: false, error: 'actor_unknown' });

  await addEvent(orderId, actorUid, 'RESCHEDULED', {
    to: scheduledAt,
    reason: reason ?? null,
  } as any);

  // ✅ Notificar al otro participante (DB + PUSH)
  try {
    const customerUserId = await getCustomerUserId(order.customerId);
    const specialistUserId = order.specialistId
      ? await getSpecialistUserId(order.specialistId)
      : null;

    const recipientId = actorUid === customerUserId ? specialistUserId : customerUserId;

    if (recipientId) {
      const notif = await prisma.notification.create({
        data: {
          userId: recipientId,
          type: 'ORDER_RESCHEDULED',
          title: 'Reprogramación',
          body: `Se reprogramó el trabajo para ${new Date(scheduledAt).toLocaleString()}.`,
          data: { orderId, scheduledAt, reason: reason ?? null } as any,
        },
        select: { id: true, title: true, body: true },
      });

      await pushToUser({
        userId: recipientId,
        title: notif.title ?? 'Reprogramación',
        body: notif.body ?? 'Se reprogramó el trabajo.',
        data: {
          notificationId: notif.id,
          type: 'ORDER_RESCHEDULED',
          orderId,
        },
      });
    }
  } catch (e) {
    console.warn('[RESCHEDULE] notify failed', e);
  }

  res.json({ ok: true, order: updated });
});

// POST /orders/:id/finish
orders.post('/:id/finish', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = finishOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });
  const { attachments, note } = parse.data;

  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(order.status as OrderStatus)) {
    return res.status(409).json({ ok: false, error: 'not_in_progress' });
  }

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { status: 'IN_CLIENT_REVIEW' },
  });

  const actorUid = await resolveActorUserId(order, getActorUserId(req));
  if (!actorUid) return res.status(400).json({ ok: false, error: 'actor_unknown' });

  await addEvent(orderId, actorUid, 'FINISHED_BY_SPECIALIST', {
    attachments: attachments ?? [],
    note: note ?? null,
  } as any);

  // ✅ Notificar al cliente que el especialista marcó finalizado
  try {
    const customerUserId = await getCustomerUserId(order.customerId);
    if (customerUserId) {
      const notif = await prisma.notification.create({
        data: {
          userId: customerUserId,
          type: 'ORDER_FINISHED_BY_SPECIALIST',
          title: 'Trabajo finalizado',
          body: 'El especialista marcó el trabajo como finalizado. Entrá para confirmar y calificar.',
          data: { orderId } as any,
        },
        select: { id: true, title: true, body: true },
      });

      await pushToUser({
        userId: customerUserId,
        title: notif.title ?? 'Trabajo finalizado',
        body: notif.body ?? 'El especialista marcó el trabajo como finalizado.',
        data: {
          notificationId: notif.id,
          type: 'ORDER_FINISHED_BY_SPECIALIST',
          orderId,
        },
      });
    }
  } catch (e) {
    console.warn('[FINISH] notify customer failed', e);
  }

  res.json({ ok: true, order: updated });
});

// POST /orders/:id/confirm
orders.post('/:id/confirm', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = confirmOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });

  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
  if (order.status !== 'IN_CLIENT_REVIEW') {
    return res.status(409).json({ ok: false, error: 'not_for_confirmation' });
  }

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { status: 'CONFIRMED_BY_CLIENT' },
  });

  const actorUid = (await getCustomerUserId(order.customerId)) ?? getActorUserId(req) ?? 'system';
  await addEvent(orderId, actorUid, 'CONFIRMED_BY_CLIENT');

  // ✅ NUEVO: Notificar al especialista que el cliente confirmó el trabajo
  try {
    if (order.specialistId) {
      const specialistUserId = await getSpecialistUserId(order.specialistId);
      if (specialistUserId) {
        const cust = await prisma.customerProfile.findUnique({
          where: { id: order.customerId },
          select: { user: { select: { name: true, surname: true } } },
        });
        const customerName =
          `${cust?.user?.name ?? 'El cliente'} ${cust?.user?.surname ?? ''}`.trim();

        const notif = await prisma.notification.create({
          data: {
            userId: specialistUserId,
            type: 'ORDER_CONFIRMED_BY_CLIENT',
            title: 'Trabajo confirmado',
            body: `${customerName} confirmó que el trabajo finalizó.`,
            data: { orderId, customerName } as any,
          },
          select: { id: true, title: true, body: true },
        });

        await pushToUser({
          userId: specialistUserId,
          title: notif.title ?? 'Trabajo confirmado',
          body: notif.body ?? 'El cliente confirmó el trabajo.',
          data: {
            notificationId: notif.id,
            type: 'ORDER_CONFIRMED_BY_CLIENT',
            orderId,
            customerName,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[CONFIRM] notify specialist failed', e);
  }

  res.json({ ok: true, order: updated });
});

// POST /orders/:id/reject
orders.post('/:id/reject', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = rejectOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });
  const { reason } = parse.data;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    include: { customer: { select: { userId: true } } },
  });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });

  const uid = getActorUserId(req);
  if (!uid || uid !== order.customer?.userId) {
    return res.status(403).json({ ok: false, error: 'only_customer' });
  }
  if (order.status !== 'IN_CLIENT_REVIEW') {
    return res.status(409).json({ ok: false, error: 'not_in_review' });
  }

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { status: 'IN_PROGRESS' },
  });

  await addEvent(orderId, uid, 'REJECTED_BY_CLIENT', {
    reason: reason ?? null,
  } as any);

  // ✅ Notificar al especialista que el cliente rechazó (DB + PUSH)
  try {
    if (order.specialistId) {
      const specialistUserId = await getSpecialistUserId(order.specialistId);
      if (specialistUserId) {
        // (opcional) nombre del cliente para mensaje más humano
        const cust = await prisma.customerProfile.findUnique({
          where: { id: order.customerId },
          select: { user: { select: { name: true, surname: true } } },
        });
        const customerName =
          `${cust?.user?.name ?? 'El cliente'} ${cust?.user?.surname ?? ''}`.trim();

        const notif = await prisma.notification.create({
          data: {
            userId: specialistUserId,
            type: 'ORDER_REJECTED_BY_CLIENT',
            title: 'Trabajo rechazado',
            body: `${customerName} rechazó el trabajo. ${reason ? `Motivo: ${reason}` : ''}`.trim(),
            data: { orderId, reason: reason ?? null, customerName } as any,
          },
          select: { id: true, title: true, body: true },
        });

        await pushToUser({
          userId: specialistUserId,
          title: notif.title ?? 'Trabajo rechazado',
          body: notif.body ?? 'El cliente rechazó el trabajo.',
          data: {
            notificationId: notif.id,
            type: 'ORDER_REJECTED_BY_CLIENT',
            orderId,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[REJECT] notify specialist failed', e);
  }

  res.json({ ok: true, order: updated });
});

// POST /orders/:id/rate
orders.post('/:id/rate', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = rateOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });
  const { score, comment } = parse.data;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { userId: true } },
      specialist: { select: { id: true } },
      rating: true,
    },
  });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });

  const uid = getActorUserId(req);
  if (!uid || uid !== order.customer?.userId) {
    return res.status(403).json({ ok: false, error: 'only_customer' });
  }
  if (order.status !== 'CONFIRMED_BY_CLIENT') {
    return res.status(409).json({ ok: false, error: 'not_confirmed_by_client' });
  }
  if (order.rating) return res.status(409).json({ ok: false, error: 'already_rated' });

  const closed = await prisma.$transaction(async (tx) => {
    await tx.rating.create({
      data: { orderId, score, comment: comment ?? null, reviewerId: uid },
    });
    const closedOrder = await tx.serviceOrder.update({
      where: { id: orderId },
      data: { status: 'CLOSED' },
      include: { rating: true },
    });
    if (order.specialist?.id) {
      const agg = await tx.rating.aggregate({
        _avg: { score: true },
        _count: { _all: true },
        where: { order: { specialistId: order.specialist.id } },
      });
      await tx.specialistProfile.update({
        where: { id: order.specialist.id },
        data: {
          ratingAvg: agg._avg.score ?? 0,
          ratingCount: agg._count._all ?? 0,
        },
      });
    }
    return closedOrder;
  });

  await addEvent(orderId, uid, 'RATED', {
    score,
    comment: comment ?? null,
  } as any);

  // ✅ Notificar al especialista (DB + PUSH)
  try {
    if (order.specialist?.id) {
      const specialistUserId = await getSpecialistUserId(order.specialist.id);
      if (specialistUserId) {
        const notif = await prisma.notification.create({
          data: {
            userId: specialistUserId,
            type: 'ORDER_RATED',
            title: 'Nueva calificación recibida',
            body: `Te calificaron con ${score} estrellas.`,
            data: { orderId, score, comment: comment ?? null } as any,
          },
          select: { id: true, title: true, body: true },
        });

        await pushToUser({
          userId: specialistUserId,
          title: notif.title ?? 'Nueva calificación',
          body: notif.body ?? `Te calificaron con ${score} estrellas.`,
          data: {
            notificationId: notif.id,
            type: 'ORDER_RATED',
            orderId,
            score,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[RATE] notify specialist failed', e);
  }

  // ✅ NUEVO: borrar el chat de esta orden (si había)
  await deleteChatForOrder(orderId);

  res.json({ ok: true, order: closed });
});

// POST /orders/:id/cancel
orders.post('/:id/cancel', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = cancelOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });
  const { reason } = parse.data;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { userId: true } },
      specialist: { select: { id: true } },
    },
  });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });

  const uid = getActorUserId(req);
  if (!uid || uid !== order.customer?.userId) {
    return res.status(403).json({ ok: false, error: 'only_customer' });
  }
  if (['CONFIRMED_BY_CLIENT', 'CLOSED'].includes(order.status as OrderStatus)) {
    return res.status(409).json({ ok: false, error: 'already_closed' });
  }

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { status: 'CANCELLED_BY_CUSTOMER' },
  });

  await addEvent(orderId, uid, 'CANCELLED_BY_CUSTOMER', {
    reason: reason ?? null,
  } as any);

  // ❗ Regla clave:
  // - NO tocamos statsCanceled (no se penaliza al especialista nunca por cancelación del cliente).
  // - Sí notificamos al especialista si había uno asignado.
  try {
    if (order.specialist?.id) {
      const specialistUserId = await getSpecialistUserId(order.specialist.id);
      if (specialistUserId) {
        const notif = await prisma.notification.create({
          data: {
            userId: specialistUserId,
            type: 'ORDER_CANCELLED_BY_CUSTOMER',
            title: 'Solicitud cancelada',
            body: 'El cliente canceló esta solicitud.',
            data: { orderId } as any,
          },
          select: { id: true, title: true, body: true },
        });

        await pushToUser({
          userId: specialistUserId,
          title: notif.title ?? 'Solicitud cancelada',
          body: notif.body ?? 'El cliente canceló esta solicitud.',
          data: {
            notificationId: notif.id,
            type: 'ORDER_CANCELLED_BY_CUSTOMER',
            orderId,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[CANCEL] notify specialist failed', e);
  }

  res.json({ ok: true, order: updated });
});

// POST /orders/:id/cancel-by-specialist
orders.post('/:id/cancel-by-specialist', auth, async (req, res) => {
  const orderId = req.params.id;
  const parse = cancelBySpecialistSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ ok: false, error: parse.error.flatten() });
  const { reason } = parse.data;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    include: {
      specialist: { select: { id: true, userId: true } },
      customer: { select: { id: true } },
    },
  });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!order.specialist)
    return res.status(409).json({ ok: false, error: 'no_specialist_assigned' });

  const uid = getActorUserId(req);
  if (!uid || uid !== order.specialist.userId) {
    return res.status(403).json({ ok: false, error: 'only_assigned_specialist' });
  }
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(order.status as OrderStatus)) {
    return res.status(409).json({ ok: false, error: 'invalid_state' });
  }

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { status: CANCELLED_BY_SPECIALIST },
  });

  await addEvent(orderId, uid, 'CANCELLED_BY_SPECIALIST', {
    reason: reason ?? null,
  } as any);

  // ✅ penaliza especialista
  await bumpSpecialistCanceledStats(order.specialist.id);

  // ✅ Notificar al cliente (DB + PUSH)
  try {
    if (order.customer?.id) {
      const customerUserId = await getCustomerUserId(order.customer.id);
      if (customerUserId) {
        const notif = await prisma.notification.create({
          data: {
            userId: customerUserId,
            type: 'ORDER_CANCELLED_BY_SPECIALIST',
            title: 'Solicitud cancelada',
            body: 'El especialista canceló tu solicitud.',
            data: { orderId, reason: reason ?? null } as any,
          },
          select: { id: true, title: true, body: true },
        });

        await pushToUser({
          userId: customerUserId,
          title: notif.title ?? 'Solicitud cancelada',
          body: notif.body ?? 'El especialista canceló tu solicitud.',
          data: {
            notificationId: notif.id,
            type: 'ORDER_CANCELLED_BY_SPECIALIST',
            orderId,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[CANCEL-BY-SPECIALIST] notify customer failed', e);
  }

  res.json({ ok: true, order: updated });
});

// POST /orders/:id/extend-deadline
orders.post('/:id/extend-deadline', auth, async (req, res) => {
  const orderId = req.params.id;
  const minutes = Number(req.body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    return res.status(400).json({ ok: false, error: 'minutes_between_1_1440' });
  }

  const order = await prisma.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
  if (order.status !== 'PENDING') {
    return res.status(409).json({ ok: false, error: 'only_pending' });
  }

  const base = order.acceptDeadlineAt ?? now();
  const newDeadline = addMinutes(base, minutes);

  const updated = await prisma.serviceOrder.update({
    where: { id: orderId },
    data: { acceptDeadlineAt: newDeadline, acceptDeadlineExtendedAt: now() },
  });

  const actorUid = getActorUserId(req) ?? 'system';
  await addEvent(orderId, actorUid, 'ACCEPT_DEADLINE_EXTENDED', {
    minutes,
    from: order.acceptDeadlineAt as any,
    to: newDeadline as any,
  } as any);

  res.json({ ok: true, order: updated });
});

// GET /orders/:id  (detalle)
orders.get('/:id', auth, async (req, res) => {
  try {
    const uid = getActorUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const id = req.params.id;
    const order = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        service: {
          include: {
            category: { select: { name: true, slug: true } },
          },
        },
        specialist: {
          select: {
            id: true,
            userId: true,
            centerLat: true,
            centerLng: true,
            user: { select: { name: true, surname: true } },
          },
        },
        customer: {
          include: {
            user: { select: { name: true } },
          },
        },
        location: true,
        events: { orderBy: { createdAt: 'asc' } },
        chatThread: true,
        rating: true,
      },
    });

    if (!order) return res.status(404).json({ ok: false, error: 'not_found' });

    const isCustomer = order.customer?.userId === uid;
    const isSpecialist = order.specialist?.userId === uid;
    if (!isCustomer && !isSpecialist) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    // 🔹 avatars de perfiles
    const [customerAvatar, specialistAvatar] = await Promise.all([
      (prisma as any).customerProfile.findUnique({
        where: { id: order.customerId },
        select: { avatarUrl: true },
      }),
      order.specialistId
        ? (prisma as any).specialistProfile.findUnique({
            where: { id: order.specialistId },
            select: { avatarUrl: true },
          })
        : Promise.resolve(null),
    ]);

    // ───────── AUTOCANCEL PENDIENTE VENCIDA ─────────
    if (
      order.status === 'PENDING' &&
      order.acceptDeadlineAt &&
      order.acceptDeadlineAt < new Date()
    ) {
      await prisma.serviceOrder.update({
        where: { id: order.id },
        data: { status: 'CANCELLED_AUTO' },
      });

      await addEvent(order.id, 'system', 'CANCELLED_AUTO', {
        reason: 'accept_deadline_expired',
        deadlineAt: order.acceptDeadlineAt,
      } as any);

      // ✅ Notificar al cliente (DB + PUSH)
      try {
        const customerUserId = await getCustomerUserId(order.customerId);
        if (customerUserId) {
          const notif = await prisma.notification.create({
            data: {
              userId: customerUserId,
              type: 'ORDER_CANCELLED_AUTO',
              title: 'Solicitud vencida',
              body: 'La solicitud se canceló automáticamente porque venció el tiempo de aceptación.',
              data: { orderId: order.id } as any,
            },
            select: { id: true, title: true, body: true },
          });

          await pushToUser({
            userId: customerUserId,
            title: notif.title ?? 'Solicitud vencida',
            body: notif.body ?? 'La solicitud se canceló automáticamente.',
            data: {
              notificationId: notif.id,
              type: 'ORDER_CANCELLED_AUTO',
              orderId: order.id,
            },
          });
        }
      } catch (e) {
        console.warn('[CANCELLED_AUTO] notify customer failed', e);
      }

      // ✅ Notificar al especialista (DB + PUSH)
      if (order.specialistId) {
        try {
          const specialistUserId = await getSpecialistUserId(order.specialistId);
          if (specialistUserId) {
            const notif2 = await prisma.notification.create({
              data: {
                userId: specialistUserId,
                type: 'ORDER_CANCELLED_AUTO',
                title: 'Solicitud vencida',
                body: 'Una solicitud pendiente fue cancelada automáticamente por falta de aceptación.',
                data: { orderId: order.id } as any,
              },
              select: { id: true, title: true, body: true },
            });

            await pushToUser({
              userId: specialistUserId,
              title: notif2.title ?? 'Solicitud vencida',
              body: notif2.body ?? 'Una solicitud fue cancelada automáticamente.',
              data: {
                notificationId: notif2.id,
                type: 'ORDER_CANCELLED_AUTO',
                orderId: order.id,
              },
            });
          }
        } catch (e) {
          console.warn('[CANCELLED_AUTO] notify specialist failed', e);
        }
      }

      (order as any).status = 'CANCELLED_AUTO';
    }

    // ───────── DISTANCIA ─────────
    let distanceKm: number | null = null;
    const loc: any = order.location;
    const jobLat = loc && typeof loc.lat === 'number' ? (loc.lat as number) : null;
    const jobLng = loc && typeof loc.lng === 'number' ? (loc.lng as number) : null;

    const specLat =
      typeof order.specialist?.centerLat === 'number'
        ? (order.specialist.centerLat as number)
        : null;
    const specLng =
      typeof order.specialist?.centerLng === 'number'
        ? (order.specialist.centerLng as number)
        : null;

    // 👇 coords del que consulta (vienen por query desde el mobile)
    const viewerLatRaw = req.query.lat ? Number(req.query.lat) : undefined;
    const viewerLngRaw = req.query.lng ? Number(req.query.lng) : undefined;
    const viewerLat = viewerLatRaw != null && !Number.isNaN(viewerLatRaw) ? viewerLatRaw : null;
    const viewerLng = viewerLngRaw != null && !Number.isNaN(viewerLngRaw) ? viewerLngRaw : null;

    if (jobLat != null && jobLng != null) {
      // 1️⃣ Caso ideal: tenemos ubicación del trabajo
      if (viewerLat != null && viewerLng != null) {
        // Distancia trabajo ↔ usuario que está viendo
        distanceKm = haversineKm(jobLat, jobLng, viewerLat, viewerLng);
      } else if (specLat != null && specLng != null) {
        // Fallback: trabajo ↔ centro del especialista
        distanceKm = haversineKm(jobLat, jobLng, specLat, specLng);
      }
    } else if (viewerLat != null && viewerLng != null && specLat != null && specLng != null) {
      // 2️⃣ NUEVO: no hay jobLat/jobLng → usamos viewer ↔ especialista
      distanceKm = haversineKm(viewerLat, viewerLng, specLat, specLng);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[GET /orders/:id] coords =', {
        jobLat,
        jobLng,
        specLat,
        specLng,
        viewerLat,
        viewerLng,
        distanceKm,
      });
    }

    // ───────── META DE DEADLINE ─────────
    let timeLeftMs: number | null = null;
    let deadline: 'none' | 'expired' | 'active' = 'none';

    if (order.status === 'PENDING' && order.acceptDeadlineAt) {
      const nowDate = new Date();
      timeLeftMs = Math.max(0, order.acceptDeadlineAt.getTime() - nowDate.getTime());
      deadline = order.acceptDeadlineAt < nowDate ? 'expired' : 'active';
    }

    // ───────── ADJUNTOS ─────────
    const rawAttachments = Array.isArray(order.attachments) ? (order.attachments as any[]) : [];

    const attachments = rawAttachments
      .map((a) => {
        if (!a) return null;
        const url = a.url ?? a.uri ?? a.fileUrl ?? null;
        if (!url || typeof url !== 'string') return null;
        return {
          type: a.type ?? 'image',
          url,
        };
      })
      .filter(Boolean);

    // ───────── DIRECCIÓN ─────────
    // ✅ Legacy-safe: si existe location pero formatted viene vacío, usamos addressText
    const resolvedAddress =
      typeof order.location?.formatted === 'string' && order.location.formatted.trim()
        ? order.location.formatted.trim()
        : typeof order.addressText === 'string' && order.addressText.trim()
          ? order.addressText.trim()
          : null;

    // ───────── PAYLOAD FINAL ─────────
    const payload = {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      scheduledAt: order.scheduledAt,
      preferredAt: order.preferredAt,
      isUrgent: order.isUrgent,
      acceptDeadlineAt: order.status === 'PENDING' ? (order.acceptDeadlineAt ?? null) : null,
      price: order.agreedPrice ?? null,
      description: order.description ?? null,
      attachments,

      service: {
        id: order.service.id,
        name: order.service.name,
        categoryName: order.service.category?.name ?? null,
        categorySlug: order.service.category?.slug ?? null,
      },

      specialist: order.specialist
        ? {
            id: order.specialist.id,
            name: `${order.specialist.user.name ?? 'Especialista'} ${
              order.specialist.user.surname ?? ''
            }`.trim(),
            centerLat: order.specialist.centerLat,
            centerLng: order.specialist.centerLng,
            avatarUrl: specialistAvatar?.avatarUrl ?? null,
          }
        : null,

      customer: order.customer
        ? {
            id: order.customer.id,
            name: `${order.customer.user.name ?? 'Cliente'}`,
            avatarUrl: customerAvatar?.avatarUrl ?? null,
          }
        : null,

      address: order.status === 'PENDING' ? null : resolvedAddress,

      events: order.events.map((e: any) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
      chatThreadId: order.chatThread?.id ?? null,
      rating: order.rating ? { score: order.rating.score, comment: order.rating.comment } : null,

      // 👈 se expone la distancia calculada
      distanceKm,
    };

    return res.json({
      ok: true,
      order: payload,
      meta: {
        deadline,
        timeLeftMs,
        deadlineAt: order.status === 'PENDING' ? (order.acceptDeadlineAt ?? null) : null,
      },
    });
  } catch (e) {
    console.error('GET /orders/:id', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /orders (listado con meta de deadlines)
orders.get('/', auth, async (req, res) => {
  await autoCancelExpiredPendingOrders();

  const role = String(req.query.role || '');
  const id = String(req.query.id || '');
  const statusQ = String(req.query.status || '');
  const deadline = String(req.query.deadline || '').toLowerCase();

  const where: Prisma.ServiceOrderWhereInput = {};

  if (role === 'customer' && id) where.customer = { userId: id };
  if (role === 'specialist' && id) where.specialist = { userId: id };

  const OPEN_STATUSES_LOCAL: OrderStatus[] = [
    'PENDING',
    'ASSIGNED',
    'IN_PROGRESS',
    'PAUSED',
    'FINISHED_BY_SPECIALIST',
    'IN_CLIENT_REVIEW',
    'CONFIRMED_BY_CLIENT',
  ];

  // ✅ Mantener misma regla que /mine (no mostrar vencidas)
  const CLOSED_STATUSES_LOCAL: OrderStatus[] = [
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_SPECIALIST',
    // 'CANCELLED_AUTO', // 👈 ocultar vencidas también acá
    'CLOSED',
  ];

  const sq = statusQ.toLowerCase();
  if (sq === 'open') {
    where.status = { in: OPEN_STATUSES_LOCAL };
  } else if (sq === 'closed') {
    where.status = { in: CLOSED_STATUSES_LOCAL };
  } else if (statusQ) {
    where.status = statusQ as OrderStatus;
  }

  const pushAnd = (clause: Prisma.ServiceOrderWhereInput) => {
    const prev = where.AND;
    const arr = Array.isArray(prev) ? prev : prev ? [prev] : [];
    where.AND = [...arr, clause];
  };

  const nowDate = new Date();
  if (deadline === 'active') {
    pushAnd({ OR: [{ acceptDeadlineAt: null }, { acceptDeadlineAt: { gte: nowDate } }] });
  } else if (deadline === 'expired') {
    pushAnd({ acceptDeadlineAt: { lt: nowDate } });
  }

  const list = await prisma.serviceOrder.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
    include: { service: true, location: true },
  });

  const nowForMeta = new Date();
  const listWithMeta = list.map((o) => ({
    ...o,
    meta: {
      deadline:
        o.acceptDeadlineAt == null
          ? 'none'
          : o.acceptDeadlineAt < nowForMeta
            ? 'expired'
            : 'active',
      timeLeftMs: o.acceptDeadlineAt
        ? Math.max(0, o.acceptDeadlineAt.getTime() - nowForMeta.getTime())
        : null,
    },
  }));

  return res.json({ ok: true, list: listWithMeta });
});

export default orders;
