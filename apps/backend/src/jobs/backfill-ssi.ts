import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function run() {
  const specs = await prisma.specialistProfile.findMany({
    include: {
      specialties: { include: { category: { include: { group: true } } } },
    },
  })

  for (const s of specs) {
    const categorySlugs = s.specialties.map((x) => x.category.slug)
    const groupSlugs = [...new Set(s.specialties.map((x) => x.category.group.slug))]
    const verified = s.kycStatus === 'VERIFIED'

    await prisma.specialistSearchIndex.upsert({
      where: { specialistId: s.id },
      update: {
        groupSlugs,
        categorySlugs,
        centerLat: s.centerLat ?? 0,
        centerLng: s.centerLng ?? 0,
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
        centerLat: s.centerLat ?? 0,
        centerLng: s.centerLng ?? 0,
        radiusKm: s.radiusKm ?? 5,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
        badge: s.badge,
        visitPrice: s.visitPrice ?? null,
        availableNow: s.availableNow,
        verified,
      },
    })
  }
  console.log('✅ Backfill SSI listo')
}

run().finally(() => prisma.$disconnect())
