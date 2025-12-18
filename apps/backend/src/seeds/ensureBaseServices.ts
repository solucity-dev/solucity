// apps/backend/src/seeds/ensureBaseServices.ts
import { prisma } from '../lib/prisma';

const CATEGORIES: Array<{ slug: string; serviceName: string; description?: string }> = [
  { slug: 'albanileria', serviceName: 'Visita técnica', description: 'Relevamiento inicial del trabajo' },
  { slug: 'plomeria', serviceName: 'Visita técnica' },
  { slug: 'yeseria-durlock', serviceName: 'Visita técnica' },
  { slug: 'herreria', serviceName: 'Visita técnica' },
  { slug: 'carpinteria', serviceName: 'Visita técnica' },
  { slug: 'pintura', serviceName: 'Visita técnica' },
  { slug: 'jardineria', serviceName: 'Visita técnica' },
  { slug: 'piscinas', serviceName: 'Visita técnica' },
  { slug: 'aire-acondicionado', serviceName: 'Visita técnica' },
  { slug: 'servicio-tecnico-electronica', serviceName: 'Visita técnica' },
  { slug: 'servicio-tecnico-electrodomesticos', serviceName: 'Visita técnica' },
  { slug: 'servicio-tecnico-informatica', serviceName: 'Visita técnica' },
  { slug: 'camaras-y-alarmas', serviceName: 'Visita técnica' },
  { slug: 'cerrajeria', serviceName: 'Visita técnica' },
  { slug: 'limpieza', serviceName: 'Visita técnica' },
  // …sumá los slugs que uses
]

export async function main() {
  for (const item of CATEGORIES) {
    const category = await prisma.serviceCategory.findUnique({ where: { slug: item.slug } })
    if (!category) {
      console.warn(`⚠️  No existe la categoría: ${item.slug} — salteo`)
      continue
    }

    const exists = await prisma.service.findFirst({
      where: { categoryId: category.id, name: item.serviceName },
      select: { id: true },
    })
    if (exists) continue

    await prisma.service.create({
      data: {
        categoryId: category.id,
        name: item.serviceName,
        description: item.description ?? null,
        basePoints: 0,
        slaHours: 0,
      },
    })
    console.log(`✔ Service creado: ${item.serviceName} → ${item.slug}`)
  }
}


