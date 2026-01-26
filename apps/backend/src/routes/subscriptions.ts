// apps/backend/src/routes/subscriptions.ts
import { Router, type Request, type Response } from 'express';

import { auth } from '../middlewares/auth';
import {
  createSubscriptionPaymentLink,
  getOrCreateSubscriptionForSpecialist,
  handleMercadoPagoWebhook,
} from '../services/subscriptionService';

type AuthReq = Request & { user?: { id: string; role: string } };

const router = Router();

/**
 * GET /subscriptions/me
 * Devuelve la suscripción (creando el trial si no existe) para el especialista actual.
 */
router.get('/me', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const sub = await getOrCreateSubscriptionForSpecialist(userId);

    if (!sub) {
      return res.status(403).json({ ok: false, error: 'no_specialist_profile' });
    }

    const now = new Date();
    let daysRemaining: number | null = null;

    if (sub.trialEnd) {
      const diffMs = sub.trialEnd.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
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
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('GET /subscriptions/me', e);
    }
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /subscriptions/pay/link
 * Crea un link de pago (cuando corresponde).
 */
router.post('/pay/link', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const result = await createSubscriptionPaymentLink(userId);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    const msg = String(e?.message || '');

    if (msg.includes('trial_active')) {
      return res.status(400).json({ ok: false, error: 'trial_active' });
    }
    if (msg.includes('no_specialist_profile')) {
      return res.status(403).json({ ok: false, error: 'no_specialist_profile' });
    }
    if (msg.includes('PUBLIC_BACKEND_URL missing')) {
      return res.status(500).json({ ok: false, error: 'public_backend_url_missing' });
    }

    console.error('POST /subscriptions/pay/link', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /subscriptions/mercadopago/webhook
 * Webhook Mercado Pago (sin auth).
 */
router.post('/mercadopago/webhook', async (req: Request, res: Response) => {
  try {
    const paymentId =
      (req.query as any)?.['data.id'] || (req.body as any)?.data?.id || (req.body as any)?.id;

    if (!paymentId) return res.status(200).send('ok_no_payment_id');
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MP webhook] incoming', {
        query: req.query,
        body: req.body,
        paymentId: String(paymentId),
      });
    }

    await handleMercadoPagoWebhook(String(paymentId));
    return res.status(200).send('ok');
  } catch (e) {
    console.error('POST /subscriptions/mercadopago/webhook', e);
    // Mercado Pago espera 200 para no reintentar eternamente
    return res.status(200).send('ok');
  }
});

export const subscriptionsRouter = router;
export default router;
