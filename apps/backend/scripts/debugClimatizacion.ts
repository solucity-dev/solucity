import { prisma } from '../src/lib/prisma';

async function main() {
  const slug = 'climatizacion';

  const cat = await prisma.serviceCategory.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, group: { select: { slug: true, name: true } } },
  });

  console.log('CATEGORY:', cat);

  if (!cat) {
    console.log('❌ No existe serviceCategory con slug climatizacion');
    return;
  }

  // Buscamos especialistas que tienen ese rubro (relación real)
  const specsWithSpecialty = await prisma.specialistSpecialty.findMany({
    where: { categoryId: cat.id },
    select: { specialistId: true },
  });

  const specIds = specsWithSpecialty.map((x) => x.specialistId);
  console.log('specialistsSpecialty count:', specIds.length);
  console.log('sample specialistIds:', specIds.slice(0, 5));

  if (!specIds.length) {
    console.log('❌ Nadie tiene asociado climatizacion en specialistSpecialty');
    return;
  }

  // Ahora vemos el índice
  const idxRows = await prisma.specialistSearchIndex.findMany({
    where: { specialistId: { in: specIds } },
    select: {
      specialistId: true,
      categorySlugs: true,
      centerLat: true,
      centerLng: true,
      radiusKm: true,
      verified: true,
      availableNow: true,
    },
  });

  console.log('searchIndex rows found:', idxRows.length);

  const missing = idxRows.filter((r) => !(r.categorySlugs ?? []).includes(slug));
  console.log('❗ Index missing climatizacion:', missing.length);

  if (missing.length) {
    console.log(
      'Example missing:',
      missing[0]?.specialistId,
      'categorySlugs=',
      missing[0]?.categorySlugs,
    );
  }

  const ok = idxRows.filter((r) => (r.categorySlugs ?? []).includes(slug));
  console.log('✅ Index HAS climatizacion:', ok.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
