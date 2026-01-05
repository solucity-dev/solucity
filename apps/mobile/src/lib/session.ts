// apps/mobile/src/lib/session.ts
import * as SecureStore from 'expo-secure-store';

const KEY_TOKEN = 'auth.token'; // permitido: ., -, _
const KEY_USER = 'auth.user';

export type StoredUser = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  phone?: string | null;
};

export async function saveSession(token: string, user: StoredUser) {
  await SecureStore.setItemAsync(KEY_TOKEN, token);
  await SecureStore.setItemAsync(KEY_USER, JSON.stringify(user));
}

export async function readSession(): Promise<{ token: string | null; user: StoredUser | null }> {
  const [token, userStr] = await Promise.all([
    SecureStore.getItemAsync(KEY_TOKEN),
    SecureStore.getItemAsync(KEY_USER),
  ]);
  return { token, user: userStr ? JSON.parse(userStr) : null };
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_TOKEN),
    SecureStore.deleteItemAsync(KEY_USER),
  ]);
}
