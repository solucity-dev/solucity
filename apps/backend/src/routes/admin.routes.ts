import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { auth } from '../middlewares/auth'
import { requireAdmin } from '../middlewares/requireAdmin'

const router = Router()

// GET /admin/dashboard
router.get('/dashboard', auth, requireAdmin, async (_req, res) => {
  try {
    const [
      usersTotal,
      admins,
      customers,
      specialists,
      blockedUsers,
      ordersByStatus,
      kycPendingProfile,
      kycPendingSubmissions,
      certsPending,
      subsByStatus,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'SPECIALIST' } }),
      prisma.user.count({ where: { status: 'BLOCKED' } }),

      prisma.serviceOrder.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      prisma.specialistProfile.count({ where: { kycStatus: 'PENDING' } }),

      prisma.kycSubmission.count({ where: { status: 'PENDING' } }),

      prisma.specialistCertification.count({ where: { status: 'PENDING' } }),

      prisma.subscription.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ])

    const orders = ordersByStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count.status
      return acc
    }, {})

    const subscriptions = subsByStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count.status
      return acc
    }, {})

    return res.json({
      ok: true,
      users: {
        total: usersTotal,
        admins,
        customers,
        specialists,
        blocked: blockedUsers,
      },
      orders,
      verifications: {
        kycPending: Math.max(kycPendingProfile, kycPendingSubmissions), // por seguridad mientras conviven ambos
        kycPendingProfile,
        kycPendingSubmissions,
        certsPending,
      },
      subscriptions,
    })
  } catch (e) {
    console.error('[GET /admin/dashboard] error', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

export default router
