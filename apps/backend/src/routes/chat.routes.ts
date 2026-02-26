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

/* ────────────── GET /chat/threads (mis hilos) ────────────── */
chat.get('/threads', auth, async (req: any, res) => {
  const uid = getActorUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const rows = await prisma.chatThread.findMany({
    where: {
      // acceso
      OR: [{ order: { customer: { userId: uid } } }, { order: { specialist: { userId: uid } } }],
      // ✅ ocultar chats “cerrados/cancelados” del listado
      order: {
        status: { in: [...VISIBLE_ORDER_STATUSES] as any },
      },
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
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { name: true, surname: true } } },
      },
    },
    orderBy: { createdAt: 'desc' }, // ✅ ChatThread NO tiene updatedAt en tu schema
    take: 100,
  });

  const items = rows.map((t) => {
    const o = t.order;
    const last = t.messages[0] ?? null;

    const isCustomer = o?.customer?.userId === uid;
    const spec = o?.specialist as any;
    const cust = o?.customer as any;

    const counterpart = isCustomer
      ? spec
        ? {
            kind: 'specialist' as const,
            name: `${spec.user?.name ?? 'Especialista'} ${spec.user?.surname ?? ''}`.trim(),
            avatarUrl: spec.avatarUrl ?? null,
            businessName: (spec.businessName ?? null) as string | null, // ✅ NUEVO
          }
        : {
            kind: 'specialist' as const,
            name: 'Especialista',
            avatarUrl: null,
            businessName: null, // ✅ NUEVO
          }
      : cust
        ? {
            kind: 'customer' as const,
            name: `${cust.user?.name ?? 'Cliente'} ${cust.user?.surname ?? ''}`.trim(),
            avatarUrl: cust.avatarUrl ?? null,
            businessName: null, // ✅ NUEVO (customers no tienen)
          }
        : {
            kind: 'customer' as const,
            name: 'Cliente',
            avatarUrl: null,
            businessName: null, // ✅ NUEVO
          };

    return {
      id: t.id,
      orderId: o?.id ?? null,
      serviceName: o?.service?.name ?? 'Servicio',
      address: o?.location?.formatted ?? null,
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

  const uCustomer = thread.order?.customer?.userId === uid;
  const uSpecial = thread.order?.specialist?.userId === uid;
  if (!uCustomer && !uSpecial) return res.status(403).json({ ok: false, error: 'forbidden' });

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

  const uCustomer = thread.order?.customer?.userId === uid;
  const uSpecial = thread.order?.specialist?.userId === uid;
  if (!uCustomer && !uSpecial) return res.status(403).json({ ok: false, error: 'forbidden' });

  // ✅ opcional: bloquear envío si la orden ya no está en estados visibles
  const st = String(thread.order?.status ?? '');
  if (!VISIBLE_ORDER_STATUSES.includes(st as any)) {
    return res.status(409).json({
      ok: false,
      error: 'chat_closed',
      message: 'Este chat está cerrado porque la orden ya finalizó o fue cancelada.',
    });
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
    const customerUid = thread.order.customer?.userId ?? null;
    const specialistUid = thread.order.specialist?.userId ?? null;
    const recipientId = uCustomer ? specialistUid : customerUid;

    if (recipientId && recipientId !== uid) {
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

      // ✅ Si envía especialista → negocio (si existe) o nombre personal
      // ✅ Si envía cliente → nombre del cliente
      const senderTitle = uSpecial
        ? (specialistBusinessName ?? specialistPersonalName)
        : customerName;

      const title = senderTitle;
      const body = text.length > 60 ? text.slice(0, 60) + '…' : text;

      // 1) Guardar notificación
      const notif = await prisma.notification.create({
        data: {
          userId: recipientId,
          type: 'CHAT_MESSAGE',
          title,
          body,
          data: {
            threadId,
            orderId: thread.order.id,
            senderId: uid,

            // ✅ extras para mobile (si querés usarlos luego)
            businessName: uSpecial ? specialistBusinessName : null,
            senderName: uSpecial ? specialistPersonalName : customerName,
          } as any,
        },
        select: { id: true, title: true, body: true },
      });

      // 2) PUSH REAL con notificationId
      await pushToUser({
        userId: recipientId,
        title: notif.title ?? title,
        body: notif.body ?? body,
        data: {
          notificationId: notif.id,
          type: 'CHAT_MESSAGE',
          threadId,
          orderId: thread.order.id,
          senderId: uid,

          // ✅ mismos extras también en el push payload
          businessName: uSpecial ? specialistBusinessName : null,
          senderName: uSpecial ? specialistPersonalName : customerName,
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
