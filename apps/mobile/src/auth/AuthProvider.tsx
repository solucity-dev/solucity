import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api, clearAuthToken, setAuthToken, setOnUnauthorizedHandler } from '../lib/api';

// ✅ NUEVO: role global para navigationRef
import { setNavRole } from '../navigation/navigationRef';

type Role = 'ADMIN' | 'CUSTOMER' | 'SPECIALIST';
type Mode = 'client' | 'specialist'; // preferencia UI (NO fuente de verdad)

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  phone?: string | null;
};

type MeResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    role: Role;
    name?: string | null;
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

  // 👇 preferencia (solo UI)
  mode: Mode;
  setMode: (m: Mode) => Promise<void>;

  // API de auth
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setModeState] = useState<Mode>('client');
  const [loading, setLoading] = useState(true);

  const setMode = useCallback(async (m: Mode) => {
    console.log('[Auth][setMode] ->', m);
    await AsyncStorage.setItem(MODE_KEY, m);
    setModeState(m);
  }, []);

  const logout = useCallback(async () => {
    console.log('[Auth][logout] start');

    // ✅ limpia storage + headers
    await AsyncStorage.removeItem(TOKEN_KEY);
    clearAuthToken();

    // ✅ limpia estado local
    setTokenState(null);
    setUser(null);

    // ✅ limpia role global del nav
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
    setUser({ id: u.id, email: u.email, role: u.role, name: u.name, phone: u.phone });

    // ✅ CLAVE: seteamos role global para navegación deep
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

      try {
        const storedMode = await AsyncStorage.getItem(MODE_KEY);

        console.log('[Auth][login] calling /auth/me...');
        const role = await fetchMe();
        console.log('[Auth][login] /auth/me role =', role);
        console.log('[Auth][login] mode BEFORE rule =', storedMode ?? '(none)', 'state=', mode);

        // ✅ si el usuario NO es specialist, forzamos mode=client
        if (role !== 'SPECIALIST') {
          console.log('[Auth][login] role is not SPECIALIST -> forcing mode=client');
          await AsyncStorage.setItem(MODE_KEY, 'client');
          setModeState('client');
        }
      } catch (e) {
        console.log('[Auth][login] error -> logout()', e);
        await logout();
        throw e;
      }
    },
    // ✅ no dependas de mode acá para no recrear login y evitar closures raros
    [fetchMe, logout, mode],
  );

  // Hydrate inicial (token + mode + /auth/me)
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

        if (storedMode === 'specialist' || storedMode === 'client') {
          console.log('[Auth][hydrate] restoring mode from storage ->', storedMode);
          setModeState(storedMode);
        }

        if (!storedToken) {
          clearAuthToken();
          setTokenState(null);
          setUser(null);
          setNavRole(null);
          console.log('[Auth][hydrate] no token -> logged out state');
          return;
        }

        setAuthToken(storedToken);
        setTokenState(storedToken);
        console.log('[Auth] token loaded from storage');

        console.log('[Auth][hydrate] calling /auth/me...');
        const role = await fetchMe();
        console.log('[Auth][hydrate] /auth/me role =', role);
        console.log('[Auth][hydrate] mode BEFORE rule =', storedMode ?? '(none)');

        // ✅ regla de oro: si no es specialist, no puede quedar en mode=specialist
        if (role !== 'SPECIALIST') {
          console.log('[Auth][hydrate] role is not SPECIALIST -> forcing mode=client');
          await AsyncStorage.setItem(MODE_KEY, 'client');
          setModeState('client');
        }
      } catch (e) {
        console.log('[Auth][hydrate] error -> clearing token', e);

        // token inválido → limpiar
        await AsyncStorage.removeItem(TOKEN_KEY);
        clearAuthToken();
        setTokenState(null);
        setUser(null);
        setNavRole(null);
      } finally {
        console.log('[Auth][hydrate] done -> ready');
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  // Handler global 401 con Authorization => logout
  useEffect(() => {
    setOnUnauthorizedHandler(async () => {
      console.log('[Auth][401] unauthorized -> logout()');
      await logout();
    });
    return () => setOnUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      ready: !loading,
      mode,
      setMode,
      login,
      logout,
      setUser,
    }),
    [token, user, loading, mode, setMode, login, logout],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
