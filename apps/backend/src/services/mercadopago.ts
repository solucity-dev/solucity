// apps/backend/src/services/mercadopago.ts

type MpPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type MpPaymentResponse = {
  id: number | string;
  status?: string;
  external_reference?: string;
  preference_id?: string;
};

function getAccessToken() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN missing');
  return token;
}

function mpHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Crea un “payment link” via Checkout Preference (Mercado Pago).
 * Esto NO crea una suscripción recurrente automática: es pago mensual manual.
 */
export async function mpCreatePaymentLink(params: {
  amount: number;
  email: string;
  externalReference: string; // subscription.id
  reason: string;
  notificationUrl: string;
  successUrl: string;
  failureUrl: string;
}): Promise<MpPreferenceResponse> {
  const body = {
    items: [
      {
        title: params.reason,
        quantity: 1,
        unit_price: params.amount,
        currency_id: 'ARS',
      },
    ],
    payer: {
      email: params.email,
    },
    external_reference: params.externalReference,
    notification_url: params.notificationUrl,
    back_urls: {
      success: params.successUrl,
      failure: params.failureUrl,
    },
    auto_return: 'approved',
    // binary_mode: true, // opcional: si querés evitar estados intermedios
  };

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: mpHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`mp_create_preference_failed:${res.status}:${txt}`);
  }

  return (await res.json()) as MpPreferenceResponse;
}

/**
 * Obtiene el pago desde MP.
 */
export async function mpGetPayment(paymentId: string): Promise<MpPaymentResponse> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: mpHeaders(),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`mp_get_payment_failed:${res.status}:${txt}`);
  }

  return (await res.json()) as MpPaymentResponse;
}
