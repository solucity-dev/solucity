// apps/mobile/src/hooks/useSyncCustomerLOcationOnMount.ts
import * as Location from 'expo-location';
import { useEffect } from 'react';

import { api, getAuthToken, getCachedUserId } from '../lib/api';

const QA_EMAILS = new Set(['qa.customer@solucity.app', 'qa.specialist@solucity.app']);

export function useSyncCustomerLocationOnMount() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const token = getAuthToken();
      if (!token) {
        if (__DEV__) console.log('[useSyncCustomerLocationOnMount] skip: no token yet');
        return;
      }

      // ✅ Blindaje QA: jamás pisar location en backend
      try {
        const uid = getCachedUserId?.() ?? null;
        // Si tu cache guarda email, perfecto. Si guarda userId, esto no sirve.
        // Por eso además metemos el blindaje real abajo en SpecialistsListScreen.
        if (typeof uid === 'string' && QA_EMAILS.has(uid)) {
          if (__DEV__) console.log('[useSyncCustomerLocationOnMount] skip: QA user (no sync)');
          return;
        }
      } catch {}

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

        await api.patch('/customers/me/location', {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });

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
