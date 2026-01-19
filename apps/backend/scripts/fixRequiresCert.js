require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  const mustRequire = [
    'plomeria-gasista',
    'electricidad',
    'climatizacion',
    'camaras-y-alarmas',
    'personal-de-seguridad',
    'cerrajeria',
    'acompanante-terapeutico',
  ];

  const result = await prisma.serviceCategory.updateMany({
    where: { slug: { in: mustRequire } },
    data: { requiresCertification: true },
  });

  console.log('Updated rows:', result.count);

  const rows = await prisma.serviceCategory.findMany({
    where: { slug: { in: mustRequire } },
    select: { slug: true, name: true, requiresCertification: true },
    orderBy: { slug: 'asc' },
  });

  console.table(rows);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
