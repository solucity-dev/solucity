import { prisma } from '../src/lib/prisma';

async function main() {
  // 1) buscar órdenes ya vencidas
  const orders = await prisma.serviceOrder.findMany({
    where: { status: 'CANCELLED_AUTO' },
    select: { id: true, customerId: true, specialistId: true, acceptDeadlineAt: true },
    take: 500,
  });

  let created = 0;

  for (const o of orders) {
    // 2) si ya existe notif para cliente, saltar
    const customerUserId = await prisma.customerProfile
      .findUnique({
        where: { id: o.customerId },
        select: { userId: true },
      })
      .then((r) => r?.userId ?? null);

    if (customerUserId) {
      const exists = await prisma.notification.findFirst({
        where: {
          userId: customerUserId,
          type: 'ORDER_CANCELLED_AUTO',
          data: { path: ['orderId'], equals: o.id } as any,
        },
        select: { id: true },
      });

      if (!exists) {
        await prisma.notification.create({
          data: {
            userId: customerUserId,
            type: 'ORDER_CANCELLED_AUTO',
            title: 'Solicitud vencida',
            body: 'La solicitud se canceló automáticamente porque venció el tiempo de aceptación.',
            data: { orderId: o.id } as any,
          },
        });
        created++;
      }
    }

    // 3) notif especialista si había preasignado
    if (o.specialistId) {
      const specUserId = await prisma.specialistProfile
        .findUnique({
          where: { id: o.specialistId },
          select: { userId: true },
        })
        .then((r) => r?.userId ?? null);

      if (specUserId) {
        const existsSpec = await prisma.notification.findFirst({
          where: {
            userId: specUserId,
            type: 'ORDER_CANCELLED_AUTO',
            data: { path: ['orderId'], equals: o.id } as any,
          },
          select: { id: true },
        });

        if (!existsSpec) {
          await prisma.notification.create({
            data: {
              userId: specUserId,
              type: 'ORDER_CANCELLED_AUTO',
              title: 'Solicitud vencida',
              body: 'Una solicitud pendiente fue cancelada automáticamente por falta de aceptación.',
              data: { orderId: o.id } as any,
            },
          });
          created++;
        }
      }
    }
  }

  console.log('Backfill done. Notifications created:', created);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => prisma.$disconnect());
