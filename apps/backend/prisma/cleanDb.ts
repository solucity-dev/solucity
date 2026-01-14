import { PrismaClient, Role } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

function getAdminProtections() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const systemActorId = (process.env.SYSTEM_ACTOR_ID || '').trim();

  return { adminEmail, systemActorId };
}

async function main() {
  const { adminEmail, systemActorId } = getAdminProtections();

  // 1) Identificar usuarios que NO se pueden borrar
  const protectedUsers = await prisma.user.findMany({
    where: {
      OR: [
        { role: Role.ADMIN },
        ...(adminEmail ? [{ email: adminEmail }] : []),
        ...(systemActorId ? [{ id: systemActorId }] : []),
      ],
    },
    select: { id: true, email: true, role: true },
  });

  const protectedIds = protectedUsers.map((u) => u.id);

  console.log('🔒 Usuarios protegidos (NO se borran):', protectedUsers);

  // 2) Ejecutar deletes en orden para no chocar con FK restrict/cascade
  await prisma.$transaction([
    // Chat
    prisma.chatMessage.deleteMany({}),
    prisma.chatThread.deleteMany({}),

    // Ratings + eventos
    prisma.rating.deleteMany({}),
    prisma.orderEvent.deleteMany({}),

    // Orders
    prisma.serviceOrder.deleteMany({}),

    // Notificaciones
    prisma.notification.deleteMany({}),

    // Auth / sesiones
    prisma.refreshToken.deleteMany({}),
    prisma.passwordReset.deleteMany({}),
    prisma.termsAcceptance.deleteMany({}),
    prisma.pushToken.deleteMany({}),

    // Especialistas: certificaciones + kyc + specialties + search index + subscription
    prisma.specialistCertification.deleteMany({}),
    prisma.kycSubmission.deleteMany({}),
    prisma.specialistSpecialty.deleteMany({}),
    prisma.specialistSearchIndex.deleteMany({}),
    prisma.subscription.deleteMany({}),

    // Perfiles (ojo: customer tiene defaultAddressId, pero Address no tiene FK a customer, así que ok)
    prisma.customerProfile.deleteMany({
      where: { userId: { notIn: protectedIds } },
    }),
    prisma.specialistProfile.deleteMany({
      where: { userId: { notIn: protectedIds } },
    }),

    // Address (solo si querés limpieza total de direcciones guardadas)
    prisma.address.deleteMany({}),

    // Usuarios no-admin
    prisma.user.deleteMany({
      where: { id: { notIn: protectedIds } },
    }),
  ]);

  // Opcional: dejar el catálogo “limpio” de servicios custom de demo
  // (si querés, lo activamos después; por ahora NO lo toco para no romper nada)

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.specialistProfile.count(),
    prisma.customerProfile.count(),
    prisma.serviceOrder.count(),
    prisma.specialistSearchIndex.count(),
  ]);

  console.log('✅ Limpieza OK. Conteos:', {
    users: counts[0],
    specialistProfiles: counts[1],
    customerProfiles: counts[2],
    orders: counts[3],
    searchIndex: counts[4],
  });
}

main()
  .catch((e) => {
    console.error('❌ cleanDb error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
