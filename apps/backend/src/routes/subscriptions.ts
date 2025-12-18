import { Router, type Request, type Response } from 'express';
import { auth } from '../middlewares/auth';
import { getOrCreateSubscriptionForSpecialist } from '../services/subscriptionService';

type AuthReq = Request & { user?: { id: string; role: string } }

const router = Router()

/**
 * GET /subscriptions/me
 * Devuelve la suscripción (creando el trial si no existe) para el especialista actual.
 */
router.get('/me', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }

    const sub = await getOrCreateSubscriptionForSpecialist(userId)

    if (!sub) {
      // Usuario logueado pero sin perfil de especialista
      return res.status(403).json({ ok: false, error: 'no_specialist_profile' })
    }

    const now = new Date()
    let daysRemaining: number | null = null

    if (sub.trialEnd) {
      const diffMs = sub.trialEnd.getTime() - now.getTime()
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    }

    return res.json({
      ok: true,
      subscription: {
        id: sub.id,
        status: sub.status,
        currentPeriodStart: sub.currentPeriodStart.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        trialEnd: sub.trialEnd ? sub.trialEnd.toISOString() : null,
        daysRemaining,
      },
    })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('GET /subscriptions/me', e)
    }
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

export const subscriptionsRouter = router
export default router

