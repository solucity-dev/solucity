// apps/backend/prisma/scripts/createAdmin.ts
import bcrypt from 'bcryptjs'
import 'dotenv/config'
import { signToken } from '../../src/lib/jwt'
import { prisma } from '../../src/lib/prisma'

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) throw new Error('Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el .env')

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash, // <- para que también actualice la clave si ya existía
    },
    create: {
      email,
      role: 'ADMIN',
      status: 'ACTIVE',
      name: 'Admin',
      surname: 'Solucity',
      passwordHash, // <- requerido
    },
    select: { id: true, email: true, role: true },
  })

  const token = signToken({ sub: user.id, role: user.role })

  console.log('✅ Admin listo:', user.email)
  console.log('🔐 JWT (para probar admin):')
  console.log(token)
}

main()
  .catch((e) => {
    console.error('❌', e)
    process.exit(1)
  })
  .finally(async () => prisma.$disconnect())


