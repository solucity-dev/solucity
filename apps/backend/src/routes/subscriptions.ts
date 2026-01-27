// apps/backend/src/routes/subscriptions.ts
import { Router, type Request, type Response } from 'express';

import { auth } from '../middlewares/auth';
import {
  createSubscriptionPaymentLink,
  getOrCreateSubscriptionForSpecialist,
  handleMercadoPagoWebhook,
} from '../services/subscriptionService';

import type { ParsedQs } from 'qs';

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

/**
 * GET /subscriptions/return/success
 * Mercado Pago vuelve acá luego de un pago exitoso.
 * No usamos auth porque MP pega directo.
 */
router.get('/return/success', async (req: Request, res: Response) => {
  try {
    const q = req.query as ParsedQs & Record<string, any>;

    // MP suele mandar: payment_id, status, external_reference, preference_id, etc.
    const paymentId = String(q.payment_id || q.collection_id || '');
    const status = String(q.status || q.collection_status || '');
    const externalRef = String(q.external_reference || '');

    if (process.env.NODE_ENV !== 'production') {
      console.log('[MP return success]', { paymentId, status, externalRef, query: req.query });
    }

    // 🔁 Robustez: si viene paymentId, intentamos sincronizar igual que el webhook
    // (si el webhook falló o llegó tarde, esto salva el estado)
    if (paymentId) {
      await handleMercadoPagoWebhook(paymentId);
    }

    // ✅ Página mínima (no 404) + botón para volver a la app
    // Si tenés deep link, podés cambiar "solucity://subscription" por tu scheme real
    const deepLink = process.env.PUBLIC_APP_DEEPLINK || 'solucity://subscription';

    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pago aprobado</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; }
      .card { max-width: 560px; margin: 0 auto; border: 1px solid #ddd; border-radius: 14px; padding: 18px; }
      .ok { color: #0a7; font-weight: 800; font-size: 18px; }
      .muted { color: #555; margin-top: 8px; line-height: 1.4; }
      a.btn { display: inline-block; margin-top: 14px; padding: 12px 14px; background: #0aa; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 800; }
      .small { margin-top: 10px; font-size: 12px; color: #777; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="ok">Pago aprobado ✅</div>
      <div class="muted">
        Ya podés volver a la app. Si el estado no se actualiza al instante, tocá “Actualizar estado” en Suscripción.
      </div>

      <a class="btn" href="${deepLink}">Volver a la app</a>

      <div class="small">
        payment_id: <code>${paymentId || '-'}</code> · status: <code>${status || '-'}</code>
      </div>
    </div>

    <script>
      // Intento de auto-abrir la app (no rompe nada si no está el scheme configurado)
      setTimeout(function(){ window.location.href = "${deepLink}"; }, 600);
    </script>
  </body>
</html>`);
  } catch (e) {
    console.error('GET /subscriptions/return/success', e);
    return res.status(200).json({ ok: true }); // MP no necesita nada particular
  }
});

/**
 * GET /subscriptions/return/failure
 * Mercado Pago vuelve acá si el pago falla/cancela.
 */
router.get('/return/failure', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MP return failure]', { query: req.query });
    }

    const deepLink = process.env.PUBLIC_APP_DEEPLINK || 'solucity://subscription';

    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pago rechazado</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; }
      .card { max-width: 560px; margin: 0 auto; border: 1px solid #ddd; border-radius: 14px; padding: 18px; }
      .bad { color: #c33; font-weight: 800; font-size: 18px; }
      .muted { color: #555; margin-top: 8px; line-height: 1.4; }
      a.btn { display: inline-block; margin-top: 14px; padding: 12px 14px; background: #0aa; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 800; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="bad">Pago no completado</div>
      <div class="muted">
        El pago fue cancelado o rechazado. Podés volver a la app e intentar nuevamente.
      </div>
      <a class="btn" href="${deepLink}">Volver a la app</a>
    </div>
  </body>
</html>`);
  } catch (e) {
    console.error('GET /subscriptions/return/failure', e);
    return res.status(200).json({ ok: true });
  }
});

/**
 * GET /subscriptions/return/pending
 * Por si Mercado Pago redirige como pendiente en algunos casos.
 */
router.get('/return/pending', async (_req: Request, res: Response) => {
  const deepLink = process.env.PUBLIC_APP_DEEPLINK || 'solucity://subscription';
  return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Pago pendiente</title></head>
  <body style="font-family:system-ui;padding:24px">
    <h3>Pago pendiente ⏳</h3>
    <p>Volvé a la app para revisar el estado.</p>
    <p><a href="${deepLink}">Volver a la app</a></p>
  </body>
</html>`);
});

export const subscriptionsRouter = router;
export default router;
