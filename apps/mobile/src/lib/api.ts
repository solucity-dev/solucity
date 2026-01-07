import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from 'axios';

const fromExtra = (Constants.expoConfig?.extra as { API_URL?: string })?.API_URL;
const fromEnv = process.env.EXPO_PUBLIC_API_URL;
const FALLBACK = 'http://192.168.0.102:3000';

export const API_URL = fromEnv || fromExtra || FALLBACK;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

/** ── Handler global para 401 ─────────────────────────────── */
let onUnauthorizedHandler: (() => void | Promise<void>) | null = null;

export function setOnUnauthorizedHandler(fn: (() => void | Promise<void>) | null) {
  onUnauthorizedHandler = fn;
}

// Para no disparar 100 veces si hay muchos 401 seguidos
let unauthorizedNotified = false;

/** ── Auth token en memoria ─────────────────────────────── */
let AUTH_TOKEN: string | null = null;

export function setAuthToken(token: string | null) {
  AUTH_TOKEN = token;

  // ⚠️ importante
  cachedUserId = null;
  meInFlight = null;

  if (token) {
    unauthorizedNotified = false; // nuevo login → rearmamos el handler
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    console.log('[API] Authorization set (Bearer ...)');
  } else {
    delete api.defaults.headers.common.Authorization;
    console.log('[API] Authorization cleared');
  }
}

export const setAuthHeader = setAuthToken;

export function clearAuthToken() {
  setAuthToken(null);
}
export function getAuthToken() {
  return AUTH_TOKEN;
}

/** ── x-user-id ─────────────────────────────── */
type MeResponse = { ok: boolean; user?: { id?: string } };

let cachedUserId: string | null = null;
let meInFlight: Promise<string | null> | null = null;

async function fetchUserId(): Promise<string | null> {
  try {
    const r = await api.get<MeResponse>('/auth/me', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const uid = r.data?.user?.id ?? null;
    cachedUserId = uid;
    return uid;
  } catch {
    return null;
  } finally {
    meInFlight = null;
  }
}

async function ensureUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  if (meInFlight) return meInFlight;
  meInFlight = fetchUserId();
  return meInFlight;
}

/** ── REQUEST INTERCEPTOR ─────────────────────────────── */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const url = String(config.url || '');
    if (url.startsWith('/auth/me')) return config;

    const headers = {
      ...(config.headers || {}),
    } as AxiosRequestHeaders;

    const defaultAuth = api.defaults.headers.common?.Authorization;
    if (!headers['Authorization'] && defaultAuth) {
      headers['Authorization'] = defaultAuth as any;
    }

    if (AUTH_TOKEN && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }

    if (!headers['x-user-id']) {
      const uid = await ensureUserId();
      if (uid) headers['x-user-id'] = uid;
    }

    config.headers = headers;
    return config;
  },
);

/**
 * 🔥 ──────────────────────────────────────────────────────
 *      RESPONSE INTERCEPTOR → auto-logout si recibe 401
 * ────────────────────────────────────────────────────────
 */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    const reqUrl = String(err?.config?.url || '');
    const reqAuth = err?.config?.headers?.Authorization || err?.config?.headers?.authorization;

    // 1) Si es /auth/me, NO hacemos logout automático
    if (status === 401 && reqUrl.startsWith('/auth/me')) {
      return Promise.reject(err);
    }

    // 2) Si el request NO tenía Authorization → era una llamada suelta.
    //    NO limpies token (evita el loop infinito).
    if (status === 401 && !reqAuth) {
      if (__DEV__) {
        console.log('[API] 401 without Authorization → ignoring logout', reqUrl);
      }
      return Promise.reject(err);
    }

    // 3) Si había Authorization y aun así dio 401 → token inválido => logout real
    if (status === 401) {
      console.log('[API] 401 with Authorization → clearing token');

      await AsyncStorage.removeItem('auth:token');
      clearAuthToken();
      cachedUserId = null;
      meInFlight = null;

      // Avisar UNA sola vez al handler global (AuthProvider)
      if (!unauthorizedNotified && onUnauthorizedHandler) {
        unauthorizedNotified = true;
        try {
          await onUnauthorizedHandler();
        } catch (e) {
          if (__DEV__) {
            console.log('[API] onUnauthorized handler error', e);
          }
        }
      }
    }

    return Promise.reject(err);
  },
);

/** Ping de salud */
api
  .get('/health')
  .then((r) => console.log('[health OK]', r.status, r.data))
  .catch((e) => console.log('[health ERROR]', e.code, e.response?.status, e.message));

console.log('[API] baseURL =>', API_URL);
