//apps/backend/src/routes/analytics.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';

const analyticsRouter = Router();

const TrackEventSchema = z.object({
  eventType: z.string().min(1).max(80),
  sessionId: z.string().max(120).optional().nullable(),
  screen: z.string().max(80).optional().nullable(),
  platform: z.string().max(30).optional().nullable(),
  categorySlug: z.string().max(120).optional().nullable(),
  specialistId: z.string().max(40).optional().nullable(),
  orderId: z.string().max(40).optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
});

/**
 * POST /analytics/events
 * Ruta pública (no requiere login)
 */
analyticsRouter.post('/events', async (req, res) => {
  try {
    const parsed = TrackEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const created = await prisma.analyticsEvent.create({
      data: {
        userId: null, // por ahora público
        eventType: data.eventType,
        sessionId: data.sessionId ?? null,
        screen: data.screen ?? null,
        platform: data.platform ?? null,
        categorySlug: data.categorySlug ?? null,
        specialistId: data.specialistId ?? null,
        orderId: data.orderId ?? null,
        ...(data.metadata !== undefined && data.metadata !== null
          ? { metadata: data.metadata }
          : {}),
      },
      select: {
        id: true,
        eventType: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      event: created,
    });
  } catch (error) {
    console.error('[analytics/events] error', error);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
    });
  }
});

export default analyticsRouter;
