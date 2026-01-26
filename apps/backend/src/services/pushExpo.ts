import axios from 'axios';

export type ExpoMessage = {
  to: string;
  sound?: 'default' | null;
  title?: string;
  body?: string;
  data?: any;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string; // android
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(t: unknown): t is string {
  return (
    typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
  );
}

function chunk<T>(arr: T[], size = 100) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Envía push a Expo en chunks de 100.
 * Devuelve tickets para debug (ok/error por token).
 */
export async function sendExpoPush(messages: ExpoMessage[]) {
  const filtered = (messages ?? []).filter((m) => isExpoToken(m?.to));
  if (filtered.length === 0) return { ok: true, sent: 0, tickets: [] as any[] };

  const chunks = chunk(filtered, 100);
  let sent = 0;
  const tickets: any[] = [];

  for (const ch of chunks) {
    try {
      const res = await axios.post(EXPO_PUSH_URL, ch, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15_000,
        validateStatus: () => true,
      });

      const payload = res.data;

      if (process.env.NODE_ENV !== 'production') {
        console.log('[expoPush] response', { status: res.status, count: ch.length });
      }

      if (payload?.data && Array.isArray(payload.data)) {
        tickets.push(...payload.data);
      }

      if (res.status < 200 || res.status >= 300) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[expoPush] non-2xx', res.status, JSON.stringify(payload));
        }
      }

      sent += ch.length;
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[expoPush] send failed', e?.message);
      }
    }
  }

  return { ok: true, sent, tickets };
}
