// apps/backend/src/lib/qa.ts
import { prisma } from './prisma';

const QA_CUSTOMER_EMAIL = 'qa.customer@solucity.app';
const QA_SPECIALIST_EMAIL = 'qa.specialist@solucity.app';

// Córdoba centro (ajustá si querés)
const QA_CENTER = { lat: -31.4201, lng: -64.1888 };

// ✅ radio "global" para que el QA specialist aparezca desde cualquier lugar
const QA_RADIUS_KM = 20000;

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export async function ensureQaUsers() {
  if (process.env.QA_MODE !== 'true') return;

  // 1) Customer demo
  await prisma.user.upsert({
    where: { email: QA_CUSTOMER_EMAIL },
    create: {
      email: QA_CUSTOMER_EMAIL,
      passwordHash: '$2a$10$1C1Lb4Y0ftDeOA2KrV0ew.OLal8Hj58PPZdCeLKyOqW.ezA7vm4bS',
      role: 'CUSTOMER',
      name: 'QA',
      surname: 'Customer',
      status: 'ACTIVE',
      customer: { create: {} },
    },
    update: {
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
  });

  // 2) Specialist demo (con todo para ser visible)
  const qaSpecUser = await prisma.user.upsert({
    where: { email: QA_SPECIALIST_EMAIL },
    create: {
      email: QA_SPECIALIST_EMAIL,
      passwordHash: '$2a$10$1C1Lb4Y0ftDeOA2KrV0ew.OLal8Hj58PPZdCeLKyOqW.ezA7vm4bS',
      role: 'SPECIALIST',
      name: 'QA',
      surname: 'Specialist',
      status: 'ACTIVE',
    },
    update: {
      role: 'SPECIALIST',
      status: 'ACTIVE',
    },
  });

  // 2.1) aseguramos profile
  const profile = await prisma.specialistProfile.upsert({
    where: { userId: qaSpecUser.id },
    create: {
      userId: qaSpecUser.id,
      bio: 'Especialista demo para revisión de Play Console.',
      specialtyHeadline: 'Demo verificado',
      visitPrice: 15000,
      pricingLabel: 'Visita',
      currency: 'ARS',
      availableNow: true, // 👈 toggle
      kycStatus: 'VERIFIED', // 👈 gate KYC
      centerLat: QA_CENTER.lat,
      centerLng: QA_CENTER.lng,
      radiusKm: QA_RADIUS_KM, // ✅ CLAVE (antes estaba 30)
      availability: { days: [1, 2, 3, 4, 5, 6, 0], start: '00:00', end: '00:00' }, // 24hs
      avatarUrl: null,
    },
    update: {
      availableNow: true,
      kycStatus: 'VERIFIED',
      centerLat: QA_CENTER.lat,
      centerLng: QA_CENTER.lng,
      radiusKm: QA_RADIUS_KM, // ✅ CLAVE (antes estaba 30)
      visitPrice: 15000,
      pricingLabel: 'Visita',
      currency: 'ARS',
      availability: { days: [1, 2, 3, 4, 5, 6, 0], start: '00:00', end: '00:00' },
    } as any,
    select: { id: true, userId: true },
  });

  // 2.2) Background check APPROVED (gate BG)
  await prisma.specialistBackgroundCheck.upsert({
    where: { specialistId: profile.id },
    create: {
      specialistId: profile.id,
      fileUrl: '/uploads/background-checks/qa.pdf',
      status: 'APPROVED',
      reviewedAt: new Date(),
      rejectionReason: null,
      reviewerId: null,
    },
    update: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      rejectionReason: null,
      reviewerId: null,
    },
  });

  // 2.3) Subscription TRIALING (gate subOk)
  const now = new Date();
  await prisma.subscription.upsert({
    where: { specialistId: profile.id },
    create: {
      specialistId: profile.id,
      status: 'TRIALING',
      currentPeriodStart: now,
      currentPeriodEnd: addDays(now, 14),
      trialEnd: addDays(now, 14),
      provider: 'QA',
      providerSubId: 'qa',
      lastPaymentStatus: null,
      lastPaymentId: null,
    },
    update: {
      status: 'TRIALING',
      currentPeriodStart: now,
      currentPeriodEnd: addDays(now, 14),
      trialEnd: addDays(now, 14),
    },
  });

  // 2.4) SearchIndex (tu /search prefiltra por SpecialistSearchIndex)
  // OJO: groupSlugs/categorySlugs dependen de specialties.
  const anyCat = await prisma.serviceCategory.findFirst({
    where: { isActive: true },
    select: { id: true, slug: true, group: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (anyCat) {
    await prisma.specialistSpecialty.upsert({
      where: { specialistId_categoryId: { specialistId: profile.id, categoryId: anyCat.id } },
      create: { specialistId: profile.id, categoryId: anyCat.id },
      update: {},
    });

    await prisma.specialistSearchIndex.upsert({
      where: { specialistId: profile.id },
      create: {
        specialistId: profile.id,
        groupSlugs: [anyCat.group.slug],
        categorySlugs: [anyCat.slug],
        centerLat: QA_CENTER.lat,
        centerLng: QA_CENTER.lng,
        radiusKm: QA_RADIUS_KM, // ✅ CLAVE (antes 20000 hardcode, ahora constante)
        ratingAvg: 5,
        ratingCount: 20,
        badge: 'GOLD',
        visitPrice: 15000,
        availableNow: true,
        verified: true,
      },
      update: {
        groupSlugs: [anyCat.group.slug],
        categorySlugs: [anyCat.slug],
        centerLat: QA_CENTER.lat,
        centerLng: QA_CENTER.lng,
        radiusKm: QA_RADIUS_KM,
        ratingAvg: 5,
        ratingCount: 20,
        badge: 'GOLD',
        visitPrice: 15000,
        availableNow: true,
        verified: true,
      },
    });
  }
}
