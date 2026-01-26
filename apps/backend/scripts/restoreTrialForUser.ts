import { prisma } from '../src/lib/prisma';

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  const email = 'marcialgiovanni6@gmail.com'.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, specialist: { select: { id: true } } },
  });

  if (!user || user.role !== 'SPECIALIST' || !user.specialist?.id) {
    console.error('❌ Usuario inválido para restore trial');
    process.exit(1);
  }

  const specialistId = user.specialist.id;

  const now = new Date();
  const end = daysFromNow(7); // 7 días de prueba
  const periodEnd = daysFromNow(30);

  const sub = await prisma.subscription.upsert({
    where: { specialistId },
    update: {
      status: 'TRIALING',
      trialEnd: end,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      lastPaymentStatus: null,
    },
    create: {
      specialistId,
      status: 'TRIALING',
      trialEnd: end,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    select: { id: true, status: true, trialEnd: true, currentPeriodEnd: true },
  });

  console.log('✅ Trial restaurado OK', sub);
}

main()
  .catch((e) => {
    console.error('❌ Script error', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
