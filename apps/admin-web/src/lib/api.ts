// apps/admin-web/src/lib/api.ts
const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function getAdminToken(): string {
  return String(localStorage.getItem('admin_token') ?? '').trim();
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAdminToken();

  // 🔥 Cache buster para evitar 304
  const url = `${API_URL}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;

  const resp = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init.headers ?? {}),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await resp.text();

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!resp.ok) {
    const err =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: string }).error)
        : typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message?: string }).message)
          : `HTTP ${resp.status} en ${path}`;

    throw new Error(err);
  }

  return data as T;
}


