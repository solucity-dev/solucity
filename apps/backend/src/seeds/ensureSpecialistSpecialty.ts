// apps/backend/src/seeds/ensureSpecialistSpecialty.ts
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

type EnsureArgs = {
  specialistEmail: string
  categorySlug: string
  createIfMissing?: boolean
  name?: string
  phone?: string
  passwordPlain?: string // solo si hay que crearlo
}

export async function ensureSpecialistSpecialty(args: EnsureArgs) {
  const {
    specialistEmail,
    categorySlug,
    createIfMissing = true,
    name = 'Demo Especialista',
    phone = null as string | null,
    passwordPlain = 'Solucity123',
  } = args

  // 1) Asegurar categoría
  const category = await prisma.serviceCategory.findUnique({ where: { slug: categorySlug } })
  if (!category) throw new Error(`No existe ServiceCategory.slug = ${categorySlug}`)

  // 2) Buscar user por email
  let user = await prisma.user.findUnique({ where: { email: specialistEmail } })

  // 3) Crear si falta
  if (!user && createIfMissing) {
    const passwordHash = await bcrypt.hash(passwordPlain, 10)
    user = await prisma.user.create({
      data: {
        email: specialistEmail,
        passwordHash,
        role: 'SPECIALIST',
        name,
        phone,
      },
    })
    console.log(`✔ User SPECIALIST creado: ${specialistEmail}`)
  }

  if (!user) {
    throw new Error(`No existe SPECIALIST ${specialistEmail}`)
  }
  if (user.role !== 'SPECIALIST') {
    throw new Error(`El usuario ${specialistEmail} no es SPECIALIST (role=${user.role})`)
  }

  // 4) Asegurar SpecialistProfile
  let sp = await prisma.specialistProfile.findUnique({ where: { userId: user.id } })
  if (!sp) {
    sp = await prisma.specialistProfile.create({
      data: {
        userId: user.id,
        bio: 'Especialista demo en albañilería.',
        visitPrice: 15000,
        currency: 'ARS',
        availableNow: true,
        kycStatus: 'UNVERIFIED',
      },
    })
    console.log(`✔ SpecialistProfile creado: ${specialistEmail}`)
  }

  // 5) Vincular a la categoría (SpecialistSpecialty)
  await prisma.specialistSpecialty.upsert({
    where: {
      specialistId_categoryId: { specialistId: sp.id, categoryId: category.id },
    },
    update: {},
    create: {
      specialistId: sp.id,
      categoryId: category.id,
    },
  })
  console.log(`✔ Vinculado ${specialistEmail} ↔ ${categorySlug}`)
}

