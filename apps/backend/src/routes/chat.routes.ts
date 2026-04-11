// apps/backend/src/routes/chat.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';
import { sendExpoPush } from '../services/pushExpo';
import { dbg, debugNotifications, debugPush, errMsg } from '../utils/debug';

export const chat = Router();

/* ───────────────── Helpers ───────────────── */

const getActorUserId = (req: any): string | null => (req.user?.id as string | undefined) ?? null;

/**
 * En tu schema:
 * ServiceOrder.customer -> CustomerProfile (tiene userId)
 * ServiceOrder.specialist -> SpecialistProfile (tiene userId)
 */
async function canAccessOrder(orderId: string, uid: string): Promise<boolean> {
  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      customer: { select: { userId: true } },
      specialist: { select: { userId: true } },
    },
  });
  if (!order) return false;
  return order.customer?.userId === uid || order.specialist?.userId === uid;
}

// ✅ helper push: envía a todos los tokens enabled del user
async function pushToUser(params: { userId: string; title: string; body: string; data: any }) {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: params.userId, enabled: true },
    select: { token: true },
  });

  const toList = tokens.map((t) => t.token).filter(Boolean);
  if (!toList.length) return;

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
 * ✅ Reglas de “visibilidad” del chat en el listado:
 * - Si la orden está CLOSED o cancelada/vencida, no la mostramos.
 * - Esto evita lista gigante sin “chats eliminados”.
 *
 * Ajustable si querés: por ejemplo, permitir ver CONFIRMED_BY_CLIENT.
 */
const VISIBLE_ORDER_STATUSES = [
  'ASSIGNED',
  'IN_PROGRESS',
  'PAUSED',
  'FINISHED_BY_SPECIALIST',
  'IN_CLIENT_REVIEW',
  'CONFIRMED_BY_CLIENT',
] as const;

/* ────────────── POST /chat/ensure (orderId) ────────────── */
/** Asegura que exista un thread para una orden y lo devuelve */
chat.post('/ensure', auth, async (req, res) => {
  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const parse = z.object({ orderId: z.string().min(1) }).safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: parse.error.flatten() });
  }

  const { orderId } = parse.data;

  const allowed = await canAccessOrder(orderId, uid);
  if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

  // crea si no existe
  let thread = await prisma.chatThread.findUnique({ where: { orderId } });
  if (!thread) {
    thread = await prisma.chatThread.create({ data: { orderId } });
  }

  return res.json({
    ok: true,
    thread: {
      id: thread.id,
      orderId: thread.orderId,
      createdAt: thread.createdAt,
    },
  });
});

/* ───────── POST /chat/inquiries/ensure (specialistId) ───────── */
/** Asegura que exista un thread de consulta entre cliente y especialista */
chat.post('/inquiries/ensure', auth, async (req, res) => {
  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const parse = z
    .object({
      specialistId: z.string().min(1),
      categorySlug: z.string().min(1).optional(),
    })
    .safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ ok: false, error: parse.error.flatten() });
  }

  const { specialistId, categorySlug } = parse.data;

  // uid actual debe ser cliente
  const customer = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, role: true },
  });

  if (!customer || customer.role !== 'CUSTOMER') {
    return res.status(403).json({ ok: false, error: 'customer_only' });
  }

  // specialistId recibido es SpecialistProfile.id
  const specialist = await prisma.specialistProfile.findUnique({
    where: { id: specialistId },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, role: true, name: true, surname: true } },
      businessName: true,
    },
  });

  if (!specialist?.userId) {
    return res.status(404).json({ ok: false, error: 'specialist_not_found' });
  }

  if (specialist.userId === uid) {
    return res.status(400).json({ ok: false, error: 'cannot_chat_with_self' });
  }

  let thread = await prisma.chatThread.findUnique({
    where: {
      type_customerUserId_specialistUserId: {
        type: 'INQUIRY',
        customerUserId: uid,
        specialistUserId: specialist.userId,
      },
    },
  });

  if (!thread) {
    thread = await prisma.chatThread.create({
      data: {
        type: 'INQUIRY',
        customerUserId: uid,
        specialistUserId: specialist.userId,
        categorySlug: categorySlug ?? null,
      },
    });

    // notificación inicial opcional al especialista
    try {
      const customerUser = await prisma.user.findUnique({
        where: { id: uid },
        select: { name: true, surname: true },
      });

      const customerName =
        `${customerUser?.name ?? ''} ${customerUser?.surname ?? ''}`.trim() || 'Cliente';

      const notif = await prisma.notification.create({
        data: {
          userId: specialist.userId,
          type: 'CHAT_INQUIRY',
          title: 'Nueva consulta',
          body: `${customerName} quiere consultarte por un trabajo.`,
          data: {
            threadId: thread.id,
            threadType: 'INQUIRY',
            specialistId: specialist.id,
            categorySlug: categorySlug ?? null,
            customerUserId: uid,
          } as any,
        },
        select: { id: true, title: true, body: true },
      });

      await pushToUser({
        userId: specialist.userId,
        title: notif.title,
        body: notif.body,
        data: {
          notificationId: notif.id,
          type: 'CHAT_INQUIRY',
          threadId: thread.id,
          threadType: 'INQUIRY',
          specialistId: specialist.id,
          categorySlug: categorySlug ?? null,
          customerUserId: uid,
        },
      });
    } catch (e) {
      dbg(debugNotifications || debugPush, '[chat] inquiry notify failed:', errMsg(e));
    }
  }

  return res.json({
    ok: true,
    thread: {
      id: thread.id,
      orderId: thread.orderId ?? null,
      createdAt: thread.createdAt,
      type: thread.type,
      specialistId: specialist.id,
      businessName: specialist.businessName ?? null,
    },
  });
});

/* ────────────── GET /chat/threads (mis hilos) ────────────── */
chat.get('/threads', auth, async (req: any, res) => {
  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const rows = await prisma.chatThread.findMany({
    where: {
      OR: [
        // chats de orden visibles
        {
          type: 'ORDER',
          OR: [
            { order: { customer: { userId: uid } } },
            { order: { specialist: { userId: uid } } },
          ],
          order: {
            status: { in: [...VISIBLE_ORDER_STATUSES] as any },
          },
        },

        // chats de consulta
        {
          type: 'INQUIRY',
          OR: [{ customerUserId: uid }, { specialistUserId: uid }],
        },
      ],
    },
    include: {
      order: {
        include: {
          service: true,
          customer: { include: { user: true } },
          specialist: { include: { user: true } },
          location: true,
        },
      },
      customerUser: {
        select: { id: true, name: true, surname: true },
      },
      specialistUser: {
        select: { id: true, name: true, surname: true },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { name: true, surname: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const items = rows.map((t) => {
    const last = t.messages[0] ?? null;

    if (t.type === 'ORDER') {
      const o = t.order;
      const isCustomer = o?.customer?.userId === uid;
      const spec = o?.specialist as any;
      const cust = o?.customer as any;

      const counterpart = isCustomer
        ? spec
          ? {
              kind: 'specialist' as const,
              name: `${spec.user?.name ?? 'Especialista'} ${spec.user?.surname ?? ''}`.trim(),
              avatarUrl: spec.avatarUrl ?? null,
              businessName: (spec.businessName ?? null) as string | null,
            }
          : {
              kind: 'specialist' as const,
              name: 'Especialista',
              avatarUrl: null,
              businessName: null,
            }
        : cust
          ? {
              kind: 'customer' as const,
              name: `${cust.user?.name ?? 'Cliente'} ${cust.user?.surname ?? ''}`.trim(),
              avatarUrl: cust.avatarUrl ?? null,
              businessName: null,
            }
          : {
              kind: 'customer' as const,
              name: 'Cliente',
              avatarUrl: null,
              businessName: null,
            };

      return {
        id: t.id,
        type: 'ORDER' as const,
        orderId: o?.id ?? null,
        serviceName: o?.service?.name ?? 'Servicio',
        address: o?.location?.formatted ?? null,
        categorySlug: null,
        counterpart,
        lastMessage: last
          ? {
              id: last.id,
              text: (last as any).body ?? '',
              createdAt: last.createdAt,
              senderName:
                `${last.sender?.name ?? ''} ${last.sender?.surname ?? ''}`.trim() || 'Usuario',
            }
          : null,
        createdAt: t.createdAt,
      };
    }

    const isCustomer = t.customerUserId === uid;
    const counterpart = isCustomer
      ? {
          kind: 'specialist' as const,
          name:
            `${t.specialistUser?.name ?? 'Especialista'} ${t.specialistUser?.surname ?? ''}`.trim() ||
            'Especialista',
          avatarUrl: null,
          businessName: null,
        }
      : {
          kind: 'customer' as const,
          name:
            `${t.customerUser?.name ?? 'Cliente'} ${t.customerUser?.surname ?? ''}`.trim() ||
            'Cliente',
          avatarUrl: null,
          businessName: null,
        };

    return {
      id: t.id,
      type: 'INQUIRY' as const,
      orderId: null,
      serviceName: 'Consulta previa',
      address: null,
      categorySlug: t.categorySlug ?? null,
      specialistId: t.specialistUserId ?? null, // 👈 CLAVE
      counterpart,
      lastMessage: last
        ? {
            id: last.id,
            text: (last as any).body ?? '',
            createdAt: last.createdAt,
            senderName:
              `${last.sender?.name ?? ''} ${last.sender?.surname ?? ''}`.trim() || 'Usuario',
          }
        : null,
      createdAt: t.createdAt,
    };
  });

  return res.json({ ok: true, threads: items });
});

/* ───── GET /chat/threads/:threadId/messages?cursor&take ───── */
chat.get('/threads/:threadId/messages', auth, async (req, res) => {
  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const threadId = String(req.params.threadId);
  const take = Math.min(Number(req.query.take ?? 30), 100);
  const cursorIso = String(req.query.cursor || '');
  const cursorDate = cursorIso ? new Date(cursorIso) : null;

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          customer: {
            select: {
              userId: true,
              user: { select: { name: true, surname: true } },
            },
          },
          specialist: {
            select: {
              userId: true,
              businessName: true,
              user: { select: { name: true, surname: true } },
            },
          },
        },
      },
    },
  });
  if (!thread) return res.status(404).json({ ok: false, error: 'thread_not_found' });

  let uCustomer = false;
  let uSpecial = false;

  if (thread.type === 'ORDER') {
    if (!thread.order) {
      return res.status(404).json({ ok: false, error: 'order_thread_inconsistent' });
    }

    uCustomer = thread.order.customer?.userId === uid;
    uSpecial = thread.order.specialist?.userId === uid;
  } else {
    uCustomer = thread.customerUserId === uid;
    uSpecial = thread.specialistUserId === uid;
  }

  if (!uCustomer && !uSpecial) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  // ✅ Si querés también bloquear ver mensajes cuando ya no está visible:
  // (yo NO lo bloqueo, solo lo oculto del listado, pero lo dejo opcional)
  // const st = String(thread.order?.status ?? '');
  // if (!VISIBLE_ORDER_STATUSES.includes(st as any)) {
  //   return res.status(403).json({ ok: false, error: 'thread_closed' });
  // }

  const where = cursorDate ? { threadId, createdAt: { lt: cursorDate } } : { threadId };

  const list = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: { sender: { select: { name: true, surname: true } } },
  });

  return res.json({
    ok: true,
    messages: list.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      createdAt: m.createdAt,
      readAt: m.readAt ?? null,
      isMine: m.senderId === uid,
      senderName: `${m.sender?.name ?? ''} ${m.sender?.surname ?? ''}`.trim() || 'Usuario',
    })),
  });
});

/* ────────── POST /chat/threads/:threadId/messages ────────── */
chat.post('/threads/:threadId/messages', auth, async (req, res) => {
  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const parse = z.object({ text: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: parse.error.flatten() });
  }
  const { text } = parse.data;

  const threadId = String(req.params.threadId);

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          customer: {
            select: {
              userId: true,
              user: { select: { name: true, surname: true } },
            },
          },
          specialist: {
            select: {
              userId: true,
              businessName: true,
              user: { select: { name: true, surname: true } },
            },
          },
        },
      },
    },
  });
  if (!thread) {
    // thread oculto o inexistente → no es error
    return res.json({ ok: true, messages: [] });
  }

  let uCustomer = false;
  let uSpecial = false;

  if (thread.type === 'ORDER') {
    if (!thread.order) {
      return res.status(404).json({ ok: false, error: 'order_thread_inconsistent' });
    }

    uCustomer = thread.order.customer?.userId === uid;
    uSpecial = thread.order.specialist?.userId === uid;

    if (!uCustomer && !uSpecial) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    // ✅ solo para chats de orden
    const st = String(thread.order.status ?? '');
    if (!VISIBLE_ORDER_STATUSES.includes(st as any)) {
      return res.status(409).json({
        ok: false,
        error: 'chat_closed',
        message: 'Este chat está cerrado porque la orden ya finalizó o fue cancelada.',
      });
    }
  } else {
    uCustomer = thread.customerUserId === uid;
    uSpecial = thread.specialistUserId === uid;

    if (!uCustomer && !uSpecial) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
  }

  const msg = await prisma.chatMessage.create({
    data: {
      threadId,
      senderId: uid,
      body: text,
    },
  });

  // 🔔 Notificación + PUSH al otro usuario
  try {
    let recipientId: string | null = null;
    let title = 'Nuevo mensaje';
    const body = text.length > 60 ? text.slice(0, 60) + '…' : text;
    let payloadData: any = {
      threadId,
      senderId: uid,
    };

    if (thread.type === 'ORDER') {
      if (!thread.order) {
        return res.status(404).json({ ok: false, error: 'order_thread_inconsistent' });
      }

      const customerUid = thread.order.customer?.userId ?? null;
      const specialistUid = thread.order.specialist?.userId ?? null;
      recipientId = uCustomer ? specialistUid : customerUid;

      const customer = thread.order.customer;
      const specialist = thread.order.specialist;

      const customerName =
        `${customer?.user?.name ?? ''} ${customer?.user?.surname ?? ''}`.trim() || 'Cliente';

      const specialistPersonalName =
        `${specialist?.user?.name ?? ''} ${specialist?.user?.surname ?? ''}`.trim() ||
        'Especialista';

      const specialistBusinessName =
        typeof specialist?.businessName === 'string' && specialist.businessName.trim()
          ? specialist.businessName.trim()
          : null;

      title = uSpecial ? (specialistBusinessName ?? specialistPersonalName) : customerName;

      payloadData = {
        ...payloadData,
        orderId: thread.order.id,
        businessName: uSpecial ? specialistBusinessName : null,
        senderName: uSpecial ? specialistPersonalName : customerName,
        threadType: 'ORDER',
      };
    } else {
      recipientId = uCustomer ? (thread.specialistUserId ?? null) : (thread.customerUserId ?? null);

      const senderUser = await prisma.user.findUnique({
        where: { id: uid },
        select: { name: true, surname: true },
      });

      const senderName =
        `${senderUser?.name ?? ''} ${senderUser?.surname ?? ''}`.trim() || 'Usuario';

      title = senderName;

      payloadData = {
        ...payloadData,
        threadType: 'INQUIRY',
        senderName,
      };
    }

    if (recipientId && recipientId !== uid) {
      const notif = await prisma.notification.create({
        data: {
          userId: recipientId,
          type: 'CHAT_MESSAGE',
          title,
          body,
          data: payloadData,
        },
        select: { id: true, title: true, body: true },
      });

      await pushToUser({
        userId: recipientId,
        title: notif.title ?? title,
        body: notif.body ?? body,
        data: {
          notificationId: notif.id,
          type: 'CHAT_MESSAGE',
          ...payloadData,
        },
      });
    }
  } catch (e) {
    dbg(debugNotifications || debugPush, '[chat] notify message failed:', errMsg(e));
  }

  return res.status(201).json({
    ok: true,
    message: {
      id: msg.id,
      body: msg.body,
      senderId: msg.senderId,
      createdAt: msg.createdAt,
      readAt: msg.readAt ?? null,
    },
  });
});

/**
 * ❌ DELETE removido a propósito.
 * Si alguien lo llama, devolvemos 405.
 */
chat.delete('/threads/:threadId', auth, async (_req, res) => {
  return res.status(405).json({
    ok: false,
    error: 'method_not_allowed',
    message:
      'Eliminar chats está deshabilitado. Los chats se ocultan automáticamente al finalizar.',
  });
});
