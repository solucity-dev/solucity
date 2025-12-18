// apps/backend/src/routes/notifications.ts
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { auth } from '../middlewares/auth'

type AuthReq = Request & { user?: { id: string; role: string } }

const router = Router()

// ✅ anti-cache fuerte (evita 304 y listas stale)
router.use((_, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Surrogate-Control', 'no-store')
  next()
})

/**
 * GET /notifications?limit=50
 * Lista las notificaciones del usuario autenticado (más recientes primero)
 */
router.get('/', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const limit = Number(req.query.limit ?? 50)
    const take = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100)

    const items = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    })

    return res.json({ ok: true, items })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('GET /notifications', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

/**
 * POST /notifications/push-token
 * Guarda / actualiza el Expo Push Token del usuario
 * Body: { token: string, platform?: string }
 */
const pushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.string().optional().nullable(),
})

router.post('/push-token', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const { token, platform } = pushTokenSchema.parse(req.body)

    // token es UNIQUE en schema.prisma
    await prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: platform ?? null,
        enabled: true,
      },
      update: {
        userId,
        platform: platform ?? null,
        enabled: true,
      },
    })

    return res.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        details: err.flatten(),
      })
    }
    if (process.env.NODE_ENV !== 'production')
      console.error('POST /notifications/push-token', err)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

/**
 * POST /notifications/read-all
 * Marca todas las notificaciones del usuario como leídas
 */
router.post('/read-all', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const now = new Date()

    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    })

    return res.json({ ok: true, count: result.count })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('POST /notifications/read-all', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

// ✅ GET /notifications/unread-count
router.get('/unread-count', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const count = await prisma.notification.count({
      where: { userId, readAt: null },
    })

    return res.json({ ok: true, count })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('GET /notifications/unread-count', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

/**
 * ✅ PATCH /notifications/:id/read
 * Marca una notificación puntual como leída
 */
router.patch('/:id/read', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ ok: false, error: 'id_required' })

    const notif = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, readAt: true },
    })

    if (!notif || notif.userId !== userId) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }

    // idempotente
    if (notif.readAt) {
      return res.json({ ok: true, id, readAt: notif.readAt })
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: { id: true, readAt: true },
    })

    return res.json({ ok: true, ...updated })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('PATCH /notifications/:id/read', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

/**
 * POST /notifications/read-up-to
 * Marca como leídas todas las notificaciones con createdAt <= la notificación indicada
 * Body: { lastId: string }
 */
router.post('/read-up-to', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const schema = z.object({
      lastId: z.string().min(1),
    })
    const { lastId } = schema.parse(req.body)

    const last = await prisma.notification.findFirst({
      where: { id: lastId, userId },
      select: { createdAt: true },
    })
    if (!last) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        createdAt: { lte: last.createdAt },
      },
      data: { readAt: new Date() },
    })

    return res.json({ ok: true, count: result.count })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        details: err.flatten(),
      })
    }
    if (process.env.NODE_ENV !== 'production')
      console.error('POST /notifications/read-up-to', err)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

/** 👇 export nombrado para server.ts */
export const notificationsRouter = router
export default router





