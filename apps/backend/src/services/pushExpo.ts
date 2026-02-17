// apps/backend/src/services/pushExpo.ts
import axios from 'axios';

import { debugPush, errMsg } from '../utils/debug';

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
  if (filtered.length === 0)
    return { ok: true, sent: 0, tickets: [] as any[], errors: [] as any[] };

  const chunks = chunk(filtered, 100);
  let sent = 0;
  const tickets: any[] = [];
  const errors: any[] = [];

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

      if (debugPush) {
        console.log('[expoPush] response', { status: res.status, count: ch.length });
      }

      if (payload?.data && Array.isArray(payload.data)) {
        tickets.push(...payload.data);

        // separar tickets con error (Expo devuelve { status: "error", message, details })
        for (const t of payload.data) {
          if (t?.status === 'error') errors.push(t);
        }
      }

      if (res.status < 200 || res.status >= 300) {
        if (debugPush) {
          console.warn('[expoPush] non-2xx', res.status, JSON.stringify(payload));
        }
      }

      sent += ch.length;
    } catch (e: any) {
      if (debugPush) {
        console.warn('[expoPush] send failed', errMsg(e));
      }
    }
  }

  if (debugPush && errors.length) {
    console.warn('[expoPush] ticket errors', {
      count: errors.length,
      sample: errors.slice(0, 3),
    });
  }

  return { ok: true, sent, tickets, errors };
}
