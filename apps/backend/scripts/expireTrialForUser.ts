import { prisma } from '../src/lib/prisma';

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  const email = 'marcialgiovanni6@gmail.com'.trim().toLowerCase();

  // 1) Buscar usuario
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, specialist: { select: { id: true } } },
  });

  if (!user) {
    console.error(`❌ No existe user con email: ${email}`);
    process.exit(1);
  }

  if (user.role !== 'SPECIALIST') {
    console.error(`❌ El user no es SPECIALIST. role=${user.role} (id=${user.id})`);
    process.exit(1);
  }

  if (!user.specialist?.id) {
    console.error(`❌ El user no tiene SpecialistProfile asociado. userId=${user.id}`);
    process.exit(1);
  }

  const specialistId = user.specialist.id;

  // 2) Asegurar suscripción
  const existingSub = await prisma.subscription.findUnique({
    where: { specialistId },
    select: { id: true, status: true },
  });

  const currentPeriodStart = daysAgo(30);
  const expiredAt = daysAgo(1);

  const sub = existingSub
    ? await prisma.subscription.update({
        where: { specialistId },
        data: {
          status: 'PAST_DUE',
          trialEnd: expiredAt,
          currentPeriodStart,
          currentPeriodEnd: expiredAt,
          lastPaymentStatus: 'pending',
        },
        select: { id: true, status: true, trialEnd: true, currentPeriodEnd: true },
      })
    : await prisma.subscription.create({
        data: {
          specialistId,
          status: 'PAST_DUE',
          trialEnd: expiredAt,
          currentPeriodStart,
          currentPeriodEnd: expiredAt,
          lastPaymentStatus: 'pending',
          provider: 'MERCADOPAGO',
        },
        select: { id: true, status: true, trialEnd: true, currentPeriodEnd: true },
      });

  // 3) Opcional: simular que NO está visible
  await prisma.specialistProfile.update({
    where: { id: specialistId },
    data: { availableNow: false },
    select: { id: true, availableNow: true },
  });

  console.log('✅ Trial expirado / estado forzado OK');
  console.log({
    userId: user.id,
    email: user.email,
    specialistId,
    subscription: sub,
  });
}

main()
  .catch((e) => {
    console.error('❌ Script error', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
