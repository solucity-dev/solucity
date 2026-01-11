// apps/mobile/src/auth/AuthProvider.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api, clearAuthToken, setAuthToken, setOnUnauthorizedHandler } from '../lib/api';
import { setNavRole } from '../navigation/navigationRef';

type Role = 'ADMIN' | 'CUSTOMER' | 'SPECIALIST';
type Mode = 'client' | 'specialist';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  surname?: string | null;
  phone?: string | null;
};

type MeResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    role: Role;
    name?: string | null;
    surname?: string | null;
    phone?: string | null;
  };
  profiles?: { customerId: string | null; specialistId: string | null };
  defaultAddress?: { id: string; formatted: string } | null;
};

type AuthContextT = {
  token: string | null;
  user: AuthUser | null;

  loading: boolean;
  ready: boolean;

  mode: Mode;
  setMode: (m: Mode) => Promise<void>;

  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
};

const TOKEN_KEY = 'auth:token';
const MODE_KEY = 'auth:mode';

export const AuthContext = createContext<AuthContextT>({
  token: null,
  user: null,
  loading: true,
  ready: false,
  mode: 'client',
  setMode: async () => {},
  login: async () => {},
  logout: async () => {},
  setUser: () => {},
});

function isUnauthorizedStatus(status?: number) {
  return status === 401 || status === 403;
}

/**
 * Cuando Render está dormido o hay mala red, Axios en RN suele tirar:
 * - code: "ERR_NETWORK"
 * - status: undefined
 * - message: "Network Error"
 *
 * Eso NO significa token inválido, así que NO debemos borrar token.
 */
function isNetworkishAxiosError(e: unknown) {
  if (!axios.isAxiosError(e)) return false;
  const status = e.response?.status;
  const code = e.code;
  // status undefined + ERR_NETWORK / Network Error => casi seguro red/cold-start
  if (status == null && (code === 'ERR_NETWORK' || /Network Error/i.test(String(e.message))))
    return true;
  // timeouts
  if (code === 'ECONNABORTED') return true;
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setModeState] = useState<Mode>('client');
  const [loading, setLoading] = useState(true);

  // ✅ carga específica de /auth/me (útil en login/registro)
  const [meLoading, setMeLoading] = useState(false);

  const setMode = useCallback(async (m: Mode) => {
    console.log('[Auth][setMode] ->', m);
    await AsyncStorage.setItem(MODE_KEY, m);
    setModeState(m);
  }, []);

  const logout = useCallback(async () => {
    console.log('[Auth][logout] start');

    await AsyncStorage.removeItem(TOKEN_KEY);
    clearAuthToken();

    setTokenState(null);
    setUser(null);

    setNavRole(null);

    console.log('[Auth][logout] done');
  }, []);

  const fetchMe = useCallback(async () => {
    console.log('[Auth][fetchMe] GET /auth/me ...');

    const r = await api.get<MeResponse>('/auth/me', {
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!r.data?.ok) throw new Error('auth_me_failed');

    const u = r.data.user;

    setUser({
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      surname: u.surname,
      phone: u.phone,
    });

    setNavRole(u.role);

    console.log('[Auth][fetchMe] ok -> role =', u.role);
    return u.role;
  }, []);

  const login = useCallback(
    async (newToken: string) => {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setAuthToken(newToken);
      setTokenState(newToken);
      console.log('[Auth] login: token set');

      setMeLoading(true);
      try {
        const storedMode = await AsyncStorage.getItem(MODE_KEY);

        console.log('[Auth][login] calling /auth/me...');
        const role = await fetchMe();

        console.log('[Auth][login] /auth/me role =', role);
        console.log('[Auth][login] storedMode BEFORE rule =', storedMode ?? '(none)');

        // ✅ si el usuario NO es specialist, forzamos mode=client
        if (role !== 'SPECIALIST') {
          console.log('[Auth][login] role is not SPECIALIST -> forcing mode=client');
          await AsyncStorage.setItem(MODE_KEY, 'client');
          setModeState('client');
        }
      } catch (e) {
        // ✅ si fue 401/403 => token inválido => logout real
        if (axios.isAxiosError(e) && isUnauthorizedStatus(e.response?.status)) {
          console.log('[Auth][login] /auth/me unauthorized -> logout()', {
            status: e.response?.status,
          });
          await logout();
          throw e;
        }

        // ✅ si fue red/cold start/timeout => NO borres token; dejá que el usuario reintente
        if (isNetworkishAxiosError(e)) {
          console.log('[Auth][login] network/cold-start error on /auth/me -> keep token', {
            code: (e as any)?.code,
            message: (e as any)?.message,
          });
          // mantenemos token; usuario puede reintentar o esperar a que Render despierte
          throw e;
        }

        // otros errores inesperados (500, etc.) -> NO borres token por las dudas, pero reportá
        console.log('[Auth][login] error (non-auth) on /auth/me -> keep token', e);
        throw e;
      } finally {
        setMeLoading(false);
      }
    },
    [fetchMe, logout],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        console.log('[Auth][hydrate] start');

        const [storedToken, storedMode] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(MODE_KEY),
        ]);

        console.log('[Auth][hydrate] storage', {
          storedToken: !!storedToken,
          storedMode,
        });

        if (cancelled) return;

        // ✅ Si NO hay token → estado logged out
        if (!storedToken) {
          clearAuthToken();
          setTokenState(null);
          setUser(null);
          setNavRole(null);

          if (storedMode === 'specialist' || storedMode === 'client') {
            setModeState(storedMode);
          }

          console.log('[Auth][hydrate] no token -> logged out state');
          return;
        }

        // ✅ Hay token -> lo seteamos y buscamos /auth/me
        setAuthToken(storedToken);
        setTokenState(storedToken);
        console.log('[Auth] token loaded from storage');

        console.log('[Auth][hydrate] calling /auth/me...');
        const role = await fetchMe();

        console.log('[Auth][hydrate] /auth/me role =', role);
        console.log('[Auth][hydrate] storedMode BEFORE rule =', storedMode ?? '(none)');

        // ✅ Reglas de mode DESPUÉS de conocer role
        if (role !== 'SPECIALIST') {
          console.log('[Auth][hydrate] role is not SPECIALIST -> forcing mode=client');
          await AsyncStorage.setItem(MODE_KEY, 'client');
          setModeState('client');
        } else {
          const nextMode: Mode =
            storedMode === 'specialist' || storedMode === 'client'
              ? (storedMode as Mode)
              : 'client';

          console.log('[Auth][hydrate] role is SPECIALIST -> restoring mode =', nextMode);
          setModeState(nextMode);
        }
      } catch (e) {
        // ✅ SOLO limpiamos token si es 401/403 (token inválido)
        if (axios.isAxiosError(e) && isUnauthorizedStatus(e.response?.status)) {
          console.log('[Auth][hydrate] /auth/me unauthorized -> clearing token', {
            status: e.response?.status,
          });

          await AsyncStorage.removeItem(TOKEN_KEY);
          clearAuthToken();
          setTokenState(null);
          setUser(null);
          setNavRole(null);
        } else if (isNetworkishAxiosError(e)) {
          // ✅ Si es red/cold start: NO tocar token (evita “se rompió todo”)
          console.log('[Auth][hydrate] network/cold-start error -> keeping token', {
            code: (e as any)?.code,
            message: (e as any)?.message,
          });
          // Dejamos token y user en null por ahora. La app puede mostrar loader o permitir reintentar.
          // (Tu UI decide qué hacer cuando user == null pero token existe)
        } else {
          // Otros errores: tampoco borremos token automáticamente
          console.log('[Auth][hydrate] error (non-auth) -> keeping token', e);
        }
      } finally {
        console.log('[Auth][hydrate] done -> ready');
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  useEffect(() => {
    setOnUnauthorizedHandler(async () => {
      console.log('[Auth][401] unauthorized -> logout()');
      await logout();
    });
    return () => setOnUnauthorizedHandler(null);
  }, [logout]);

  const effectiveLoading = loading || meLoading;

  const value = useMemo(
    () => ({
      token,
      user,
      loading: effectiveLoading,
      ready: !effectiveLoading,
      mode,
      setMode,
      login,
      logout,
      setUser,
    }),
    [token, user, effectiveLoading, mode, setMode, login, logout],
  );

  if (effectiveLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
