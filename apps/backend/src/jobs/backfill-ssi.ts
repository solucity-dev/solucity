//apps/backend/src/jobs/backfill-ssi.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const specs = await prisma.specialistProfile.findMany({
    include: {
      specialties: { include: { category: { include: { group: true } } } },
    },
  });

  let updated = 0;
  let skippedNoCoords = 0;

  for (const s of specs) {
    const categorySlugs = s.specialties.map((x) => x.category.slug);

    const groupSlugs = [
      ...new Set(
        s.specialties
          .map((x) => x.category.group?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    ];

    const verified = s.kycStatus === 'VERIFIED';

    // ✅ Evita indexar en 0,0 (si no tiene coords)
    if (s.centerLat == null || s.centerLng == null) {
      skippedNoCoords++;
      continue;
    }

    await prisma.specialistSearchIndex.upsert({
      where: { specialistId: s.id },
      update: {
        groupSlugs,
        categorySlugs,
        centerLat: s.centerLat,
        centerLng: s.centerLng,
        radiusKm: s.radiusKm ?? 5,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
        badge: s.badge,
        visitPrice: s.visitPrice ?? null,
        availableNow: s.availableNow,
        verified,
      },
      create: {
        specialistId: s.id,
        groupSlugs,
        categorySlugs,
        centerLat: s.centerLat,
        centerLng: s.centerLng,
        radiusKm: s.radiusKm ?? 5,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
        badge: s.badge,
        visitPrice: s.visitPrice ?? null,
        availableNow: s.availableNow,
        verified,
      },
    });

    updated++;
  }

  console.log(`✅ Backfill SSI listo. updated=${updated}, skippedNoCoords=${skippedNoCoords}`);
}

run().finally(() => prisma.$disconnect());
