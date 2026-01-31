//apps/mobile/src/hooks/useSyncCustomerLOcationOnMount.ts
import * as Location from 'expo-location';
import { useEffect } from 'react';

import { api, getAuthToken, getCachedUserId } from '../lib/api';

export function useSyncCustomerLocationOnMount() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const token = getAuthToken();
      if (!token) {
        if (__DEV__) console.log('[useSyncCustomerLocationOnMount] skip: no token yet');
        return;
      }

      // ✅ NO pedimos permisos acá. Solo chequeamos.
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        if (__DEV__) console.log('[useSyncCustomerLocationOnMount] skip: no location permission');
        return;
      }

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        // ✅ Mandamos al backend
        await api.patch('/customers/me/location', {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });

        // ✅ Cache simple local opcional (si querés ver en logs)
        const uid = getCachedUserId?.() ?? null;
        if (__DEV__) console.log('[useSyncCustomerLocationOnMount] synced location for', uid);
      } catch (e: any) {
        const st = e?.response?.status;
        if (__DEV__) console.log('[useSyncCustomerLocationOnMount] error', st, e?.message);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);
}
