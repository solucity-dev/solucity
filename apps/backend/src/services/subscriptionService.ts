import { prisma } from '../lib/prisma'

const TRIAL_DAYS = 30

export async function getOrCreateSubscriptionForSpecialist(userId: string) {
  // 1) Buscar el perfil de especialista de ese usuario
  const specialist = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!specialist) {
    // Usuario logueado pero sin perfil de especialista
    return null
  }

  const now = new Date()

  // 2) Buscar si ya tiene suscripción
  const existing = await prisma.subscription.findUnique({
    where: { specialistId: specialist.id },
  })

  if (!existing) {
    // 3) Si no existe → crear TRIAL de 30 días desde hoy
    const end = new Date(now)
    end.setDate(end.getDate() + TRIAL_DAYS)

    return prisma.subscription.create({
      data: {
        specialistId: specialist.id,
        status: 'TRIALING',
        currentPeriodStart: now,
        currentPeriodEnd: end,
        trialEnd: end,
      },
    })
  }

  // 4) Si existe y estaba en TRIAL y se venció → marcar como PAST_DUE
  if (existing.status === 'TRIALING' && existing.trialEnd && existing.trialEnd < now) {
    return prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'PAST_DUE' },
    })
  }

  // 5) Para todos los demás casos, devolver tal cual
  return existing
}

