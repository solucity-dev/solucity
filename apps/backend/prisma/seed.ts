// prisma/seed.ts
import {
  Badge,
  Prisma,
  PrismaClient,
  Role,
  SubscriptionStatus,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

type GroupSeed = {
  name: string;
  slug: string;
  rubros: string[];
};

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
      'Plomería / Gasista',
      'Pintura',
      'Jardinería',
      'Piscinas',
      'Desagote y baños químicos',
      'Soldador',
      'Porcelanato liquido',
      'Vidriería',
      'Aberturas',
      'Impermeabilización',
      'Zinguería',
    ],
  },
  {
    name: 'Informática y electrónica',
    slug: 'informatica-electronica',
    rubros: [
      'Climatizacion',
      'Cartelería',
      'Servicio técnico electrónica',
      'Reparación de celulares',
      'Servicio tecnico electrodomésticos',
      'Servicio tecnico audiovisual',
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
      'Cercos eléctricos / perimetrales',
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
      'Cuidado de mascotas',
      'Fletes',
      'Diseño de interiores',
      'Organización de eventos',
      'Fotografía y video',
      'Atención al cliente',
    ],
  },
  {
    name: 'Gastronomía',
    slug: 'gastronomia',
    rubros: [
      'Camarero / Mozo',
      'Cocinero',
      'Bartender',
      'Catering',
      'Ayudante de cocina',
      'Bachero',
    ],
  },
  {
    name: 'Profesionales',
    slug: 'profesionales',
    rubros: [
      'Abogado',
      'Contador',
      'Escribano',
      'Arquitecto',
      'Ingeniero',
      'Psicólogo',
      'Psiquiatra',
    ],
  },
  {
    name: 'Estética',
    slug: 'estetica',
    rubros: [
      'Peluquería',
      'Barbería',
      'Manicuría / Uñas',
      'Maquillaje',
      'Depilación',
      'Cosmetología',
      'Masajes',
      'Spa / Estética corporal',
      'Cejas y pestañas',
    ],
  },
  {
    name: 'Alquiler',
    slug: 'alquiler',
    rubros: [
      'Alquiler de herramientas',
      'Alquiler de maquinaria liviana',
      'Alquiler de maquinaria pesada',
      'Alquiler de generadores',
      'Alquiler de andamios',
      'Alquiler de hidrolavadoras',
      'Alquiler de hormigoneras',
      'Alquiler de elevadores',
      'Alquiler de equipos de sonido e iluminación',
      'Alquiler de carpas y mobiliario',
    ],
  },
];

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
    .replace(/-+/g, '-');
}

// Rubros que requieren matrícula/título (certificación por rubro)
const REQUIRES_CERTIFICATION = new Set<string>([
  // Construcción
  'electricidad',
  'plomeria-gasista',
  'desagote-y-banos-quimicos', // si realmente querés exigir habilitación

  // Informática y electrónica
  'climatizacion',
  'servicio-tecnico-electronica',
  'servicio-tecnico-electrodomesticos',
  'servicio-tecnico-informatica',
  'servicio-tecnico-audiovisual', // OJO con el nombre exacto (ver punto 1.1)

  // Seguridad
  'camaras-y-alarmas',
  'cerrajeria',
  'personal-de-seguridad',
  'cercos-electricos-perimetrales', // si querés exigir habilitación (tiene sentido)

  // Servicios
  'acompanante-terapeutico',
  'fletes', // licencia + seguro (criterio tuyo)
  'diseno-de-interiores',

  // Profesionales
  'abogado',
  'contador',
  'escribano',
  'arquitecto',
  'ingeniero',
  'psicologo',
  'psiquiatra',
]);

async function upsertCategories() {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];

    const group = await prisma.serviceCategoryGroup.upsert({
      where: { slug: g.slug },
      update: {
        name: g.name,
        sortOrder: i + 1,
        isActive: true,
      },
      create: {
        name: g.name,
        slug: g.slug,
        sortOrder: i + 1,
        isActive: true,
      },
    });

    for (const r of g.rubros) {
      const slug = slugify(r);
      const requiresCertification = REQUIRES_CERTIFICATION.has(slug);

      await prisma.serviceCategory.upsert({
        where: { slug },
        update: {
          name: r,
          groupId: group.id, // por si antes estaba mal asociado
          isActive: true,
          requiresCertification,
        },
        create: {
          name: r,
          slug,
          groupId: group.id,
          isActive: true,
          requiresCertification,
        },
      });
    }
  }
}

async function createDemoUsers() {
  // Cliente demo
  const userCustomer = await prisma.user.upsert({
    // ⚠️ Mejor por email (phone es opcional y puede ser null en prod)
    where: { email: 'cliente.demo@solucity.dev' },
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
  });

  const customer = await prisma.customerProfile.upsert({
    where: { userId: userCustomer.id },
    update: {},
    create: { userId: userCustomer.id },
  });

  // Dirección demo (⚠️ idempotente: buscamos por formatted+lat+lng)
  const addr = await prisma.address
    .upsert({
      where: {
        // No hay unique compuesto en Address, así que hacemos “findFirst + create”
        // => simulamos con upsert manual:
        id: await (async () => {
          const existing = await prisma.address.findFirst({
            where: { formatted: 'Bv. San Juan 450, Córdoba', lat: -31.4167, lng: -64.1833 },
            select: { id: true },
          });
          return existing?.id ?? '___NO_ID___';
        })(),
      },
      update: {},
      create: {
        formatted: 'Bv. San Juan 450, Córdoba',
        lat: -31.4167,
        lng: -64.1833,
        placeId: 'demo_place',
      },
    })
    .catch(async () => {
      // Si el “upsert manual” cae por id inexistente, creamos o reutilizamos
      const existing = await prisma.address.findFirst({
        where: { formatted: 'Bv. San Juan 450, Córdoba', lat: -31.4167, lng: -64.1833 },
      });
      if (existing) return existing;

      return prisma.address.create({
        data: {
          formatted: 'Bv. San Juan 450, Córdoba',
          lat: -31.4167,
          lng: -64.1833,
          placeId: 'demo_place',
        },
      });
    });

  await prisma.customerProfile.update({
    where: { id: customer.id },
    data: { defaultAddressId: addr.id },
  });

  // Especialista demo
  const userSpec = await prisma.user.upsert({
    where: { email: 'especialista.demo@solucity.dev' },
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
  });

  const availability: Prisma.JsonArray = [
    { weekday: 1, startTime: '09:00', endTime: '13:00' },
    { weekday: 1, startTime: '15:00', endTime: '19:00' },
    { weekday: 3, startTime: '09:00', endTime: '13:00' },
  ];

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
  });

  const electricista = await prisma.serviceCategory.findUnique({
    where: { slug: 'electricidad' },
  });

  if (!electricista) {
    console.warn("⚠️ No se encontró el rubro 'electricidad' (revisar slug en seed).");
    return;
  }

  await prisma.specialistSpecialty.upsert({
    where: {
      specialistId_categoryId: {
        specialistId: specialist.id,
        categoryId: electricista.id,
      },
    },
    update: {},
    create: { specialistId: specialist.id, categoryId: electricista.id },
  });

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
  });

  const service = await prisma.service.upsert({
    where: { categoryId_name: { categoryId: electricista.id, name: 'Visita técnica' } },
    update: {},
    create: {
      categoryId: electricista.id,
      name: 'Visita técnica',
      description: 'Diagnóstico y presupuesto en sitio',
      basePoints: 10,
      slaHours: 24,
      basePrice: 15000,
    },
  });

  // ⚠️ Evitar crear órdenes infinitas: check simple por description
  const existingOrder = await prisma.serviceOrder.findFirst({
    where: {
      customerId: customer.id,
      specialistId: specialist.id,
      serviceId: service.id,
      description: 'Salta el disyuntor al encender el microondas.',
    },
    select: { id: true },
  });

  if (!existingOrder) {
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
    });

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        actorId: userSpec.id,
        type: 'ASSIGNED',
        payload: { note: 'Aceptada por especialista demo' },
      },
    });
  }
}

/**
 * ========= NUEVO: especialistas demo para TODOS los rubros =========
 */
async function createDemoSpecialists() {
  const allCats = await prisma.serviceCategory.findMany({ include: { group: true } });
  if (!allCats.length) {
    console.warn('⚠️ Aún no hay categorías. Llamá a upsertCategories() antes.');
    return;
  }

  const baseLat = -33.1489;
  const baseLng = -64.3333;

  for (const cat of allCats) {
    for (let i = 0; i < 2; i++) {
      const email = `spec.${cat.slug}.${i + 1}@demo.solucity.dev`;

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
      });

      const existingSpec = await prisma.specialistProfile.findUnique({
        where: { userId: user.id },
      });
      if (existingSpec) continue;

      const lat = baseLat + (Math.random() - 0.5) * 0.08;
      const lng = baseLng + (Math.random() - 0.5) * 0.08;
      const rating = 3.6 + Math.random() * 1.4;
      const visits = 10 + Math.floor(Math.random() * 160);
      const price = 8000 + Math.floor(Math.random() * 22000);
      const badgeList = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
      const badge = badgeList[Math.floor(Math.random() * badgeList.length)];
      const availableNow = Math.random() > 0.35;
      const verified = Math.random() > 0.5;

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
      });

      await prisma.specialistSpecialty.create({
        data: { specialistId: specialist.id, categoryId: cat.id },
      });

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
      });
    }
  }
}

/**
 * ✅ EXPORT para producción (endpoint /admin/seed)
 */
export async function runSeed() {
  const seedDemos = String(process.env.SEED_DEMOS ?? '').toLowerCase() === 'true';

  // Camino A: siempre catálogo
  await upsertCategories();

  // Solo si querés demos explícitamente
  if (seedDemos) {
    await createDemoUsers();
    await createDemoSpecialists();
  }

  const [groupsCount, catsCount, usersCount] = await Promise.all([
    prisma.serviceCategoryGroup.count(),
    prisma.serviceCategory.count(),
    prisma.user.count(),
  ]);

  return {
    seedDemos,
    counts: { groups: groupsCount, categories: catsCount, users: usersCount },
  };
}

/**
 * CLI compat: pnpm prisma db seed
 */
async function main() {
  const result = await runSeed();
  console.log('✅ Seed completado:', result);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
