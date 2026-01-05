//apps/backend/src/services/push.ts
import fetch from 'node-fetch';

type PushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: any;
  sound?: 'default';
  channelId?: string; // android
};

export async function sendExpoPush(messages: PushMessage[]) {
  if (!messages.length) return;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    console.warn('[push] failed', res.status, json);
    return;
  }

  // Expo devuelve tickets (ok / error por token)
  return json;
}
