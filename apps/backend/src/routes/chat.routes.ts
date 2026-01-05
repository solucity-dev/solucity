// apps/backend/src/routes/chat.ts (o donde lo tengas)
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';
import { sendExpoPush } from '../services/pushExpo';

const headerUserId = (req: import('express').Request) =>
  String(req.header('x-user-id') || '').trim() || null;

const getActorUserId = (req: any): string | null =>
  (req.user?.id as string | undefined) ?? headerUserId(req);

export const chat = Router();

/* ───────────────── Helpers ───────────────── */

async function canAccessOrder(orderId: string, uid: string): Promise<boolean> {
  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      customer: { select: { userId: true } },
      specialist: { select: { userId: true } },
    },
  });
  if (!order) return false;
  const isCustomer = order.customer?.userId === uid;
  const isSpecialist = order.specialist?.userId === uid;
  return isCustomer || isSpecialist;
}

// ✅ helper push igual al de orders: envía a todos los tokens enabled del user
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
      OR: [{ order: { customer: { userId: uid } } }, { order: { specialist: { userId: uid } } }],
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
    orderBy: { createdAt: 'desc' },
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
          }
        : { kind: 'specialist' as const, name: 'Especialista', avatarUrl: null }
      : cust
        ? {
            kind: 'customer' as const,
            name: `${cust.user?.name ?? 'Cliente'}`.trim(),
            avatarUrl: cust.avatarUrl ?? null,
          }
        : { kind: 'customer' as const, name: 'Cliente', avatarUrl: null };

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
          customer: { select: { userId: true } },
          specialist: { select: { userId: true } },
        },
      },
    },
  });
  if (!thread) {
    return res.status(404).json({ ok: false, error: 'thread_not_found' });
  }

  const uCustomer = thread.order?.customer?.userId === uid;
  const uSpecial = thread.order?.specialist?.userId === uid;
  if (!uCustomer && !uSpecial) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const where = cursorDate ? { threadId, createdAt: { lt: cursorDate } } : { threadId };

  const list = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      sender: { select: { name: true, surname: true } },
    },
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
          customer: { select: { userId: true } },
          specialist: { select: { userId: true } },
        },
      },
    },
  });
  if (!thread) return res.status(404).json({ ok: false, error: 'thread_not_found' });

  const uCustomer = thread.order.customer?.userId === uid;
  const uSpecial = thread.order.specialist?.userId === uid;
  if (!uCustomer && !uSpecial) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const msg = await prisma.chatMessage.create({
    data: {
      threadId,
      senderId: uid,
      body: text,
    },
  });

  // 🔔 Notificación + PUSH al otro usuario (con notificationId)
  try {
    const customerUid = thread.order.customer?.userId ?? null;
    const specialistUid = thread.order.specialist?.userId ?? null;
    const recipientId = uCustomer ? specialistUid : customerUid;

    if (recipientId && recipientId !== uid) {
      const title = 'Nuevo mensaje recibido';
      const body = text.length > 60 ? text.slice(0, 60) + '…' : text;

      // 1) Guardar notificación en DB
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
          } as any,
        },
        select: { id: true, title: true, body: true },
      });

      // 2) PUSH REAL con notificationId (clave para marcar read desde el tap)
      await pushToUser({
        userId: recipientId,
        title: notif.title ?? title,
        body: notif.body ?? body,
        data: {
          notificationId: notif.id, // ✅ CLAVE
          type: 'CHAT_MESSAGE',
          threadId,
          orderId: thread.order.id,
          senderId: uid,
        },
      });
    }
  } catch (e) {
    console.warn('[CHAT] failed to notify message', e);
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

/* ────────────── DELETE /chat/threads/:threadId ────────────── */
chat.delete('/threads/:threadId', auth, async (req, res) => {
  const uid = getActorUserId(req);
  if (!uid) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const threadId = String(req.params.threadId);

  try {
    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
      include: {
        order: {
          select: {
            id: true,
            customer: { select: { userId: true } },
            specialist: { select: { userId: true } },
          },
        },
      },
    });

    if (!thread) {
      return res.status(404).json({ ok: false, error: 'thread_not_found' });
    }

    const isCustomer = thread.order?.customer?.userId === uid;
    const isSpecialist = thread.order?.specialist?.userId === uid;

    if (!isCustomer && !isSpecialist) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    await prisma.chatThread.delete({ where: { id: threadId } });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /chat/threads/:threadId] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo eliminar la conversación' });
  }
});
