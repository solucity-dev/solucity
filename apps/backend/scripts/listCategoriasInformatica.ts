import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const group = await prisma.serviceCategoryGroup.findUnique({
    where: { slug: 'informatica-electronica' },
  });

  console.log('GROUP:', group);

  const cats = await prisma.serviceCategory.findMany({
    where: { group: { slug: 'informatica-electronica' } },
    select: { id: true, name: true, slug: true, groupId: true },
    orderBy: { name: 'asc' },
  });

  console.log('CATEGORIES:');
  for (const c of cats) console.log(`- ${c.name}  |  slug=${c.slug}  | id=${c.id}`);
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
