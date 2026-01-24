// apps/admin-web/src/lib/api.ts
const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function getAdminToken(): string {
  return String(localStorage.getItem('admin_token') ?? '').trim();
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function isAbortError(e: unknown): e is { name: string } {
  return typeof e === 'object' && e !== null && 'name' in e && (e as { name: string }).name === 'AbortError';
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();

  // 🔥 Cache buster para evitar 304
  const url = `${API_URL}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;

  const MAX_RETRIES = 2; // 🔒 solo para errores transitorios
  const TIMEOUT_MS = 25_000; // 🔒 evita fetch colgado

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
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

        // 🔁 retry SOLO para errores típicos de servidor dormido / rate limit
        if (attempt < MAX_RETRIES && [429, 502, 503, 504].includes(resp.status)) {
          await sleep(600 * (attempt + 1));
          continue;
        }

        throw new Error(err);
      }

      return data as T;
    } catch (e: unknown) {
      lastError = e;

      // ⏱️ timeout (AbortError) o red caída (TypeError) → retry
      if (attempt < MAX_RETRIES && (isAbortError(e) || e instanceof TypeError)) {
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (isAbortError(e)) {
        throw new Error('La solicitud tardó demasiado. El servidor puede estar iniciándose. Reintentá.');
      }

      if (e instanceof TypeError) {
        throw new Error('No se pudo conectar con el servidor. Verificá tu conexión.');
      }

      // Si ya es Error real, lo re-lanzamos
      if (e instanceof Error) throw e;

      // fallback seguro
      throw new Error('Error desconocido');
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('Error desconocido');
}



