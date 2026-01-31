// apps/mobile/src/lib/locationOnce.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { api } from './api';

const ASKED_PREFIX = 'loc:onboard:asked:'; // por usuario
const LAST_COORDS_PREFIX = 'loc:last:'; // por usuario
const LAST_SYNC_PREFIX = 'loc:lastsync:'; // por usuario (para TTL)

// ✅ TTL para evitar spamear el backend con auto-sync
// Recomendación: 6h. Si querés más “tranqui”, 24h.
const SYNC_TTL_MS = 6 * 60 * 60 * 1000;

function askedKey(userId: string) {
  return `${ASKED_PREFIX}${userId}`;
}

function lastCoordsKey(userId: string) {
  return `${LAST_COORDS_PREFIX}${userId}`;
}

function lastSyncKey(userId: string) {
  return `${LAST_SYNC_PREFIX}${userId}`;
}

async function shouldSyncNow(userId: string) {
  const raw = await AsyncStorage.getItem(lastSyncKey(userId));
  const last = raw ? Number(raw) : 0;
  if (!last || Number.isNaN(last)) return true;
  return Date.now() - last > SYNC_TTL_MS;
}

// ✅ helper opcional: para que SpecialistHome marque lastSync cuando el usuario toca el botón manual
export async function markLocationSynced(userId: string, coords?: { lat: number; lng: number }) {
  try {
    await AsyncStorage.setItem(lastSyncKey(userId), String(Date.now()));
    if (coords) {
      await AsyncStorage.setItem(lastCoordsKey(userId), JSON.stringify(coords));
    }
  } catch {
    // fail-soft
  }
}

export type LocationOnceResult = {
  asked: boolean;
  granted: boolean;
  coords?: { lat: number; lng: number } | null;
};

export async function ensureLocationPermissionOnce(args: {
  userId: string;
  role: 'ADMIN' | 'CUSTOMER' | 'SPECIALIST';
}): Promise<LocationOnceResult> {
  const { userId, role } = args;

  // ✅ si ya preguntamos antes en este dispositivo para este usuario -> no volvemos a preguntar
  const alreadyAsked = (await AsyncStorage.getItem(askedKey(userId))) === '1';
  if (alreadyAsked) {
    // si ya estaba concedido, podemos leer coords sin pedir popup
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { asked: true, granted: false, coords: null };

    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      // ✅ cache local (sirve para cliente y para debug)
      await AsyncStorage.setItem(lastCoordsKey(userId), JSON.stringify(coords));

      // ✅ IMPORTANTE: acá NO hacemos PATCH automático si ya existe TTL vigente,
      // porque este branch corre en cada sesión (ya se pidió permiso antes).
      if (role === 'SPECIALIST') {
        try {
          const okToSync = await shouldSyncNow(userId);
          if (okToSync) {
            await api.patch('/specialists/me', {
              centerLat: coords.lat,
              centerLng: coords.lng,
            });
            await AsyncStorage.setItem(lastSyncKey(userId), String(Date.now()));
          }
        } catch {
          // fail-soft
        }
      }

      return { asked: true, granted: true, coords };
    } catch {
      return { asked: true, granted: true, coords: null };
    }
  }

  // ✅ marcamos como “ya preguntado” ANTES de pedir permiso para evitar loops si algo crashea
  await AsyncStorage.setItem(askedKey(userId), '1');

  // ✅ pedir permiso (solo una vez)
  const permReq = await Location.requestForegroundPermissionsAsync();
  if (permReq.status !== 'granted') {
    return { asked: true, granted: false, coords: null };
  }

  // ✅ permiso concedido -> obtener coords
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };

    // ✅ cache local
    await AsyncStorage.setItem(lastCoordsKey(userId), JSON.stringify(coords));

    // ✅ si es especialista: subimos coords para que esté “visible” rápido (pero con TTL)
    if (role === 'SPECIALIST') {
      try {
        const okToSync = await shouldSyncNow(userId);
        if (okToSync) {
          await api.patch('/specialists/me', {
            centerLat: coords.lat,
            centerLng: coords.lng,
          });
          await AsyncStorage.setItem(lastSyncKey(userId), String(Date.now()));
        }
      } catch {
        // fail-soft
      }
    }

    return { asked: true, granted: true, coords };
  } catch {
    return { asked: true, granted: true, coords: null };
  }
}
