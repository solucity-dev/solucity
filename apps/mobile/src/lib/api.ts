// apps/mobile/src/lib/api.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from 'axios';

/**
 * 1) URLS
 * - ENV (preferido): EXPO_PUBLIC_API_URL
 * - extra (app.config / app.json)
 * - fallback PROD (Render) ✅
 */
const fromExtra = (Constants.expoConfig?.extra as { API_URL?: string })?.API_URL;
const fromEnv = process.env.EXPO_PUBLIC_API_URL;

// ✅ TU URL REAL DE RENDER (HTTPS)
const PROD_FALLBACK = 'https://solucity-backend.onrender.com';

// Si estás en DEV y querés forzar local, seteá EXPO_PUBLIC_API_URL con tu LAN.
// const LOCAL_FALLBACK = 'http://192.168.0.103:3000';

export const API_URL = (fromEnv || fromExtra || PROD_FALLBACK).replace(/\/+$/, '');

/**
 * 2) Axios instance
 */
export const api = axios.create({
  baseURL: API_URL,
  timeout: 25000, // Render cold start + internet lenta
});

/** ── Handler global para 401 ─────────────────────────────── */
let onUnauthorizedHandler: (() => void | Promise<void>) | null = null;

export function setOnUnauthorizedHandler(fn: (() => void | Promise<void>) | null) {
  onUnauthorizedHandler = fn;
}

// Para no disparar 100 veces si hay muchos 401 seguidos
let unauthorizedNotified = false;

/** ── Handler global para user_blocked (403) ─────────────────────────────── */
let onBlockedHandler: (() => void | Promise<void>) | null = null;

export function setOnBlockedHandler(fn: (() => void | Promise<void>) | null) {
  onBlockedHandler = fn;
}

// Para no disparar 100 veces si hay muchos 403 user_blocked seguidos
let blockedNotified = false;

/** ── Auth token en memoria ─────────────────────────────── */
let AUTH_TOKEN: string | null = null;

/** ──────────────────────────────────────────────────────
 *  Helpers JWT (sin dependencias) → sacar sub del token
 *  Evitamos llamar /auth/me para cada request (causaba bloqueos/lentitud)
 * ────────────────────────────────────────────────────── */
function base64UrlDecode(input: string) {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');

  // atob existe en Expo/RN. Si alguna vez falla, lo ajustamos.
  const raw = atob(base64);

  // Convertimos a UTF-8 safe
  return decodeURIComponent(
    Array.prototype.map
      .call(raw, (c: string) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
      .join(''),
  );
}

function getUserIdFromJwt(token: string | null): string | null {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** ── x-user-id cache ───────────────────────────────
 *  Ya NO hacemos /auth/me en cada request.
 *  Lo resolvemos desde el JWT al loguear.
 */
let cachedUserId: string | null = null;

export function setAuthToken(token: string | null) {
  AUTH_TOKEN = token;

  // ✅ clave: setear userId desde JWT (sin pedir /auth/me)
  cachedUserId = getUserIdFromJwt(token);

  if (token) {
    unauthorizedNotified = false;
    blockedNotified = false; // ✅ reset también cuando se setea token

    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    if (__DEV__)
      console.log('[API] Authorization set (Bearer ...)', { cachedUserId, baseURL: API_URL });
  } else {
    delete api.defaults.headers.common.Authorization;
    if (__DEV__) console.log('[API] Authorization cleared');
  }
}

export const setAuthHeader = setAuthToken;

export function clearAuthToken() {
  setAuthToken(null);
}
export function getAuthToken() {
  return AUTH_TOKEN;
}

/** ── REQUEST INTERCEPTOR ───────────────────────────────
 *  Importante: NO bloquear requests esperando /auth/me.
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const headers = {
      ...(config.headers || {}),
    } as AxiosRequestHeaders;

    // Copiar auth por default si existe
    const defaultAuth = api.defaults.headers.common?.Authorization;
    if (!headers['Authorization'] && defaultAuth) {
      headers['Authorization'] = defaultAuth as any;
    }

    // Si hay token en memoria y no vino header, lo agregamos
    if (AUTH_TOKEN && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }

    // ✅ x-user-id SIN await: si lo tenemos, lo mandamos. Si no, seguimos.
    if (!headers['x-user-id'] && cachedUserId) {
      headers['x-user-id'] = cachedUserId;
    }

    config.headers = headers;
    return config;
  },
);

/**
 * ── RESPONSE INTERCEPTOR ─────────────────────────────────────────────
 * - 403 user_blocked => limpiar sesión + handler dedicado (una sola vez)
 * - 401 con Authorization => token inválido => limpiar sesión + unauthorized handler (una sola vez)
 */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    const reqUrl = String(err?.config?.url || '');
    const reqAuth = err?.config?.headers?.Authorization || err?.config?.headers?.authorization;

    // LOG útil para diferenciar "network" vs "backend"
    if (__DEV__) {
      console.log('[API ERROR]', {
        baseURL: API_URL,
        url: reqUrl,
        status,
        code: err?.code,
        message: err?.message,
      });
    }

    const apiError = err?.response?.data?.error;

    // ✅ 403 user_blocked => logout + handler (una sola vez)
    // Importante: NO logout por cualquier 403 (hay 403 válidos: kyc_required, background_check_required, etc.)
    if (status === 403 && String(apiError) === 'user_blocked') {
      if (__DEV__) console.log('[API] 403 user_blocked -> clearing token');

      await AsyncStorage.removeItem('auth:token');
      clearAuthToken();
      cachedUserId = null;

      if (!blockedNotified && onBlockedHandler) {
        blockedNotified = true;
        try {
          await onBlockedHandler();
        } catch (e) {
          if (__DEV__) console.log('[API] onBlocked handler error', e);
        }
      }

      return Promise.reject(err);
    }

    // Si el request NO tenía Authorization → no tocar sesión (evita loops)
    if (status === 401 && !reqAuth) {
      if (__DEV__) console.log('[API] 401 without Authorization → ignoring logout', reqUrl);
      return Promise.reject(err);
    }

    // Si había Authorization y dio 401 → token inválido => logout real
    if (status === 401) {
      if (__DEV__) console.log('[API] 401 with Authorization → clearing token');

      await AsyncStorage.removeItem('auth:token');
      clearAuthToken();
      cachedUserId = null;

      if (!unauthorizedNotified && onUnauthorizedHandler) {
        unauthorizedNotified = true;
        try {
          await onUnauthorizedHandler();
        } catch (e) {
          if (__DEV__) console.log('[API] onUnauthorized handler error', e);
        }
      }
    }

    return Promise.reject(err);
  },
);

/** Ping de salud (solo dev) */
if (__DEV__) {
  api
    .get('/health')
    .then((r) => console.log('[health OK]', r.status, r.data))
    .catch((e) => console.log('[health ERROR]', e.code, e.response?.status, e.message));

  console.log('[API] baseURL =>', API_URL);
}
