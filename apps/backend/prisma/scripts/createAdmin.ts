import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const pass = process.env.ADMIN_PASSWORD

  if (!email || !pass) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env')
  }

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    console.log('Admin already exists:', exists.email)
    return
  }

  const passwordHash = await bcrypt.hash(pass, 10)

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      name: 'Admin',
      surname: 'Solucity',
    },
  })

  console.log('Admin created:', admin.email, admin.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
