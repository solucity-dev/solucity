//apps/backend/src/routes/clients.routes.ts
import { Router } from 'express';

import { prisma } from '../lib/prisma';
import { auth } from '../middlewares/auth';

export const clients = Router();

function getActorUserId(req: any): string | null {
  return req.user?.id ?? null;
}

clients.get('/:userId/profile', auth, async (req: any, res) => {
  try {
    const actorUserId = getActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const targetUserId = String(req.params.userId ?? '').trim();
    if (!targetUserId) {
      return res.status(400).json({ ok: false, error: 'missing_user_id' });
    }

    // 1) El usuario objetivo debe existir y tener CustomerProfile
    const targetCustomer = await prisma.customerProfile.findUnique({
      where: { userId: targetUserId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            createdAt: true,
          },
        },
      },
    });

    if (!targetCustomer) {
      return res.status(404).json({ ok: false, error: 'customer_not_found' });
    }

    // 2) Resolver si el actor es especialista
    const actorSpecialist = await prisma.specialistProfile.findUnique({
      where: { userId: actorUserId },
      select: {
        id: true,
        userId: true,
      },
    });

    // Permitimos que el propio cliente vea su perfil
    const isSelf = actorUserId === targetUserId;

    // Si no es self, exigimos que sea especialista vinculado por orden o chat
    if (!isSelf) {
      if (!actorSpecialist) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      const hasSharedOrder = await prisma.serviceOrder.findFirst({
        where: {
          customerId: targetCustomer.id,
          specialistId: actorSpecialist.id,
        },
        select: { id: true },
      });

      const hasSharedInquiryThread = await prisma.chatThread.findFirst({
        where: {
          type: 'INQUIRY',
          customerUserId: targetUserId,
          specialistUserId: actorUserId,
        },
        select: { id: true },
      });

      const hasAccess = !!hasSharedOrder || !!hasSharedInquiryThread;

      if (!hasAccess) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
    }

    // 3) Estadísticas básicas del cliente
    const [
      totalOrders,
      completedOrders,
      closedOrders,
      canceledByCustomerOrders,
      canceledBySpecialistOrders,
    ] = await Promise.all([
      prisma.serviceOrder.count({
        where: { customerId: targetCustomer.id },
      }),
      prisma.serviceOrder.count({
        where: {
          customerId: targetCustomer.id,
          status: { in: ['CONFIRMED_BY_CLIENT', 'CLOSED'] },
        },
      }),
      prisma.serviceOrder.count({
        where: {
          customerId: targetCustomer.id,
          status: 'CLOSED',
        },
      }),
      prisma.serviceOrder.count({
        where: {
          customerId: targetCustomer.id,
          status: 'CANCELLED_BY_CUSTOMER',
        },
      }),
      prisma.serviceOrder.count({
        where: {
          customerId: targetCustomer.id,
          status: 'CANCELLED_BY_SPECIALIST',
        },
      }),
    ]);

    // 4) Historial resumido
    const historyRows = await prisma.serviceOrder.findMany({
      where: {
        customerId: targetCustomer.id,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        scheduledAt: true,
        preferredAt: true,
        serviceMode: true,
        service: {
          select: {
            name: true,
            category: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
        specialist: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: {
                name: true,
                surname: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const history = historyRows.map((order) => {
      const specialistDisplayName =
        order.specialist?.businessName?.trim() ||
        `${order.specialist?.user?.name ?? 'Especialista'} ${order.specialist?.user?.surname ?? ''}`.trim();

      return {
        orderId: order.id,
        status: order.status,
        createdAt: order.createdAt,
        scheduledAt: order.scheduledAt,
        preferredAt: order.preferredAt,
        serviceMode: order.serviceMode,
        serviceName: order.service?.name ?? null,
        categoryName: order.service?.category?.name ?? null,
        categorySlug: order.service?.category?.slug ?? null,
        specialist: order.specialist
          ? {
              id: order.specialist.id,
              name: specialistDisplayName || 'Especialista',
            }
          : null,
      };
    });

    return res.json({
      ok: true,
      profile: {
        userId: targetCustomer.user.id,
        customerProfileId: targetCustomer.id,
        name: targetCustomer.user.name ?? 'Cliente',
        surname: targetCustomer.user.surname ?? '',
        avatarUrl: targetCustomer.avatarUrl ?? null,
        memberSince: targetCustomer.user.createdAt,
        stats: {
          totalOrders,
          completedOrders,
          closedOrders,
          canceledByCustomerOrders,
          canceledBySpecialistOrders,
        },
        history,
      },
    });
  } catch (error) {
    console.error('GET /clients/:userId/profile', error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default clients;
