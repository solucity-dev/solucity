// apps/mobile/src/auth/AuthProvider.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import {
  api,
  clearAuthToken,
  setAuthToken,
  setCachedUserId,
  setOnBlockedHandler,
  setOnUnauthorizedHandler,
} from '../lib/api';
import { ensureLocationPermissionOnce } from '../lib/locationOnce';
import { clearSubscriptionCache } from '../lib/subscriptionApi';
import { setNavMode } from '../navigation/navigationRef';
import Splash from '../screens/Splash';

type Role = 'ADMIN' | 'CUSTOMER' | 'SPECIALIST';
type Mode = 'client' | 'specialist';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  surname?: string | null;
  phone?: string | null;
  profiles: {
    customerId: string | null;
    specialistId: string | null;
  };
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
  profiles: {
    customerId: string | null;
    specialistId: string | null;
  };
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setModeState] = useState<Mode>('client');
  const [loading, setLoading] = useState(true);
  const [meLoading, setMeLoading] = useState(false);

  const setMode = useCallback(
    async (m: Mode) => {
      const canUseSpecialistMode = !!user?.profiles?.specialistId;
      const nextMode: Mode = m === 'specialist' && canUseSpecialistMode ? 'specialist' : 'client';

      await AsyncStorage.setItem(MODE_KEY, nextMode);
      setModeState(nextMode);
      setNavMode(nextMode);
    },
    [user],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, MODE_KEY]);
    clearSubscriptionCache();
    clearAuthToken();
    setCachedUserId(null);
    setTokenState(null);
    setUser(null);
    setModeState('client');
    setNavMode(null);
  }, []);

  const fetchMe = useCallback(async () => {
    const r = await api.get<MeResponse>('/auth/me', {
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!r.data?.ok) throw new Error('auth_me_failed');

    const u = r.data.user;
    const profiles = r.data.profiles ?? {
      customerId: null,
      specialistId: null,
    };

    const hydratedUser: AuthUser = {
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      surname: u.surname,
      phone: u.phone,
      profiles,
    };

    setUser(hydratedUser);
    setCachedUserId(u.id);

    return hydratedUser;
  }, []);

  const login = useCallback(
    async (newToken: string) => {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setAuthToken(newToken);
      setTokenState(newToken);

      setMeLoading(true);
      try {
        const hydratedUser = await fetchMe();
        const canUseSpecialistMode = !!hydratedUser.profiles?.specialistId;

        const storedMode = await AsyncStorage.getItem(MODE_KEY);
        const nextMode: Mode =
          canUseSpecialistMode && storedMode === 'specialist' ? 'specialist' : 'client';

        await AsyncStorage.setItem(MODE_KEY, nextMode);
        setModeState(nextMode);
        setNavMode(nextMode);
      } finally {
        setMeLoading(false);
      }
    },
    [fetchMe],
  );

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        const storedMode = await AsyncStorage.getItem(MODE_KEY);

        if (!storedToken) {
          clearAuthToken();
          setLoading(false);
          return;
        }

        setAuthToken(storedToken);
        setTokenState(storedToken);

        const hydratedUser = await fetchMe();
        const canUseSpecialistMode = !!hydratedUser.profiles?.specialistId;

        const nextMode: Mode =
          canUseSpecialistMode && storedMode === 'specialist' ? 'specialist' : 'client';

        setModeState(nextMode);
        setNavMode(nextMode);
      } catch (e) {
        if (axios.isAxiosError(e) && isUnauthorizedStatus(e.response?.status)) {
          await logout();
        } else if (__DEV__) {
          console.log('[AuthProvider] bootstrap fetchMe error', {
            message: axios.isAxiosError(e) ? e.message : String(e),
            status: axios.isAxiosError(e) ? e.response?.status : undefined,
            code: axios.isAxiosError(e) ? e.code : undefined,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMe, logout]);

  // 🔐 401 handler
  useEffect(() => {
    setOnUnauthorizedHandler(async () => {
      await logout();
    });
    return () => setOnUnauthorizedHandler(null);
  }, [logout]);

  // 🚫 403 user_blocked handler (NUEVO)
  useEffect(() => {
    setOnBlockedHandler(async () => {
      Alert.alert(
        'Cuenta bloqueada',
        'Tu cuenta está bloqueada. Contactá soporte para más información.',
        [{ text: 'OK' }],
      );
      await logout();
    });
    return () => setOnBlockedHandler(null);
  }, [logout]);

  // ✅ Pedir ubicación 1 vez por usuario (solo cuando ya tenemos user real)
  useEffect(() => {
    if (!token || !user) return;

    (async () => {
      try {
        await ensureLocationPermissionOnce({
          userId: user.id,
          role: user.role,
        });
      } catch {
        // fail-soft
      }
    })();
  }, [token, user]);

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
    return <Splash />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
