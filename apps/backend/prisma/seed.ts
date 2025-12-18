// prisma/seed.ts
import {
  Badge,
  Prisma,
  PrismaClient,
  Role,
  SubscriptionStatus,
  UserStatus,
  VerificationStatus,
} from '@prisma/client'

const prisma = new PrismaClient()

type GroupSeed = {
  name: string
  slug: string
  rubros: string[]
}

const groups: GroupSeed[] = [
  {
    name: 'Construcción y mantenimiento',
    slug: 'construccion-mantenimiento',
    rubros: [
      'Albañilería',
      'Electricidad',
      'Yesería / Durlock',
      'Carpintería',
      'Herrería',
      'Plomería',
      'Pintura',
      'Jardinería',
      'Piscinas',
    ],
  },
  {
    name: 'Informática y electrónica',
    slug: 'informatica-electronica',
    rubros: [
      'Climatizacion',
      'Servicio técnico electrónica',
      'Servicio técnico electrodomésticos',
      'Servicio técnico informática',
    ],
  },
  {
    name: 'Seguridad',
    slug: 'seguridad',
    rubros: [
      'Cámaras y alarmas',
      'Cerrajería',
      'Personal de seguridad',
    ],
  },
  {
    name: 'Servicios',
    slug: 'servicios',
    rubros: [
      'Limpieza',
      'Acompañante terapéutico',
      'Clases particulares',
      'Paseador de perros',
    ],
  },
]

// Slugify igual que estás usando en mobile
function slugify(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

async function upsertCategories() {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const group = await prisma.serviceCategoryGroup.upsert({
      where: { slug: g.slug },
      update: { sortOrder: i + 1, isActive: true },
      create: { name: g.name, slug: g.slug, sortOrder: i + 1, isActive: true },
    })

    for (const r of g.rubros) {
      const slug = slugify(r)
      await prisma.serviceCategory.upsert({
        where: { slug },
        update: { isActive: true },
        create: { name: r, slug, groupId: group.id, isActive: true },
      })
    }
  }
}

async function createDemoUsers() {
  // Cliente demo
  const userCustomer = await prisma.user.upsert({
    where: { phone: '+5493511111111' },
    update: {},
    create: {
      phone: '+5493511111111',
      email: 'cliente.demo@solucity.dev',
      name: 'Cliente',
      surname: 'Demo',
      passwordHash: 'demo-hash', // TODO: hash real
      role: Role.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
  })

  const customer = await prisma.customerProfile.upsert({
    where: { userId: userCustomer.id },
    update: {},
    create: { userId: userCustomer.id },
  })

  // Dirección demo
  const addr = await prisma.address.create({
    data: {
      formatted: 'Bv. San Juan 450, Córdoba',
      lat: -31.4167,
      lng: -64.1833,
      placeId: 'demo_place',
    },
  })

  await prisma.customerProfile.update({
    where: { id: customer.id },
    data: { defaultAddressId: addr.id },
  })

  // Especialista demo (único, lo dejamos para compat y pruebas)
  const userSpec = await prisma.user.upsert({
    where: { phone: '+5493512222222' },
    update: {},
    create: {
      phone: '+5493512222222',
      email: 'especialista.demo@solucity.dev',
      name: 'Especialista',
      surname: 'Demo',
      passwordHash: 'demo-hash',
      role: Role.SPECIALIST,
      status: UserStatus.ACTIVE,
    },
  })

  const availability: Prisma.JsonArray = [
    { weekday: 1, startTime: '09:00', endTime: '13:00' },
    { weekday: 1, startTime: '15:00', endTime: '19:00' },
    { weekday: 3, startTime: '09:00', endTime: '13:00' },
  ]

  const specialist = await prisma.specialistProfile.upsert({
    where: { userId: userSpec.id },
    update: {},
    create: {
      userId: userSpec.id,
      bio: 'Electricista matriculado. 8 años de experiencia en residencias y pymes.',
      visitPrice: 15000,
      currency: 'ARS',
      availableNow: true,
      kycStatus: VerificationStatus.VERIFIED,
      badge: Badge.SILVER,
      ratingAvg: 4.7,
      ratingCount: 83,
      centerLat: -31.4165,
      centerLng: -64.1835,
      radiusKm: 10,
      availability,
    },
  })

  // Rubro Electricista
  const electricista = await prisma.serviceCategory.findUnique({
    where: { slug: 'electricidad' }, // 👈 ojo: ahora el slug correcto de tu seed es "electricidad"
  })

  if (electricista) {
    await prisma.specialistSpecialty.upsert({
      where: {
        specialistId_categoryId: {
          specialistId: specialist.id,
          categoryId: electricista.id,
        },
      },
      update: {},
      create: { specialistId: specialist.id, categoryId: electricista.id },
    })

    // Suscripción demo
    await prisma.subscription.upsert({
      where: { specialistId: specialist.id },
      update: {},
      create: {
        specialistId: specialist.id,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        trialEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    })

    // Servicio + orden demo
    const service = await prisma.service.upsert({
      where: {
        categoryId_name: { categoryId: electricista.id, name: 'Visita técnica' },
      },
      update: {},
      create: {
        categoryId: electricista.id,
        name: 'Visita técnica',
        description: 'Diagnóstico y presupuesto en sitio',
        basePoints: 10,
        slaHours: 24,
        basePrice: 15000,
      },
    })

    const order = await prisma.serviceOrder.create({
      data: {
        customerId: customer.id,
        specialistId: specialist.id,
        serviceId: service.id,
        locationId: addr.id,
        status: 'ASSIGNED',
        description: 'Salta el disyuntor al encender el microondas.',
        preferredAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 26),
        isUrgent: false,
        autoCancelAt: null,
        agreedPrice: 15000,
      },
    })

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        actorId: userSpec.id,
        type: 'ASSIGNED',
        payload: { note: 'Aceptada por especialista demo' },
      },
    })
  } else {
    console.warn("⚠️ No se encontró el rubro 'electricidad' (revisar slug en seed).")
  }
}

/**
 * ========= NUEVO: especialistas demo para TODOS los rubros =========
 */
async function createDemoSpecialists() {
  const allCats = await prisma.serviceCategory.findMany({
    include: { group: true },
  })
  if (!allCats.length) {
    console.warn('⚠️ Aún no hay categorías. Llamá a upsertCategories() antes.')
    return
  }

  const baseLat = -33.1489
  const baseLng = -64.3333

  for (const cat of allCats) {
    for (let i = 0; i < 2; i++) {
      const email = `spec.${cat.slug}.${i + 1}@demo.solucity.dev`

      // 👇 upsert por email (idempotente) y sin phone
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash: 'demo-hash',
          role: 'SPECIALIST',
          status: 'ACTIVE',
          name: `${cat.name} Demo ${i + 1}`,
        },
      })

      // Si ya tenía perfil, seguimos con el siguiente
      const existingSpec = await prisma.specialistProfile.findUnique({
        where: { userId: user.id },
      })
      if (existingSpec) continue

      const lat = baseLat + (Math.random() - 0.5) * 0.08
      const lng = baseLng + (Math.random() - 0.5) * 0.08
      const rating = 3.6 + Math.random() * 1.4
      const visits = 10 + Math.floor(Math.random() * 160)
      const price = 8000 + Math.floor(Math.random() * 22000)
      const badgeList = ['BRONZE','SILVER','GOLD','PLATINUM'] as const
      const badge = badgeList[Math.floor(Math.random()*badgeList.length)]
      const availableNow = Math.random() > 0.35
      const verified = Math.random() > 0.5

      const specialist = await prisma.specialistProfile.create({
        data: {
          userId: user.id,
          bio: `Especialista en ${cat.name}. Trabajos en zona.`,
          visitPrice: price,
          currency: 'ARS',
          availableNow,
          kycStatus: verified ? 'VERIFIED' : 'UNVERIFIED',
          badge,
          ratingAvg: Number(rating.toFixed(1)),
          ratingCount: visits,
          centerLat: lat,
          centerLng: lng,
          radiusKm: 12,
          availability: [
            { weekday: 1, startTime: '09:00', endTime: '18:00' },
            { weekday: 3, startTime: '09:00', endTime: '18:00' },
            { weekday: 5, startTime: '09:00', endTime: '18:00' },
          ] as any,
        },
      })

      await prisma.specialistSpecialty.create({
        data: { specialistId: specialist.id, categoryId: cat.id },
      })

      await prisma.specialistSearchIndex.create({
        data: {
          specialistId: specialist.id,
          groupSlugs: [cat.group.slug],
          categorySlugs: [cat.slug],
          centerLat: lat,
          centerLng: lng,
          radiusKm: 12,
          ratingAvg: Number(rating.toFixed(1)),
          ratingCount: visits,
          badge,
          visitPrice: price,
          availableNow,
          verified,
        },
      })
    }
  }
}

/**
 * ========= MAIN =========
 * Está al final del archivo (acá 👇). Acá llamás lo necesario.
 */
async function main() {
  await upsertCategories()
  await createDemoUsers()
  await createDemoSpecialists() // 👈 importante
  console.log('✅ Seed completado')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

