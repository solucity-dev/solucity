import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { api } from './api';

export type VersionCheckResult = {
  ok: boolean;
  updateAvailable: boolean;
  force: boolean;
  minVersionCode: number;
  latestVersionCode: number;
  currentVersionCode: number;
  title: string;
  message: string;
  storeUrl: string | null;
};

function getCurrentVersionCode(): number {
  if (Platform.OS === 'android') {
    const raw =
      Constants.expoConfig?.android?.versionCode ??
      (Constants as any)?.manifest2?.extra?.expoClient?.android?.versionCode ??
      (Constants as any)?.manifest?.android?.versionCode ??
      0;

    return Number(raw || 0);
  }

  // ✅ web fallback: no hay versionCode nativo, usamos 0
  return 0;
}

export async function checkAppVersion(): Promise<VersionCheckResult | null> {
  if (Platform.OS !== 'android') return null;

  const currentVersionCode = getCurrentVersionCode();

  const { data } = await api.get('/version', {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!data?.ok) {
    throw new Error('version_check_failed');
  }

  const minVersionCode = Number(data?.minVersionCode ?? 0);
  const latestVersionCode = Number(data?.latestVersionCode ?? minVersionCode);
  const force = Boolean(data?.force);
  const title = String(data?.title ?? 'Nueva actualización disponible');
  const message = String(
    data?.message ?? 'Actualizá la app para seguir usando la última versión disponible.',
  );
  const storeUrl = data?.storeUrl ? String(data.storeUrl) : null;

  const updateAvailable = currentVersionCode < latestVersionCode;
  const mustForce = currentVersionCode < minVersionCode || force;

  return {
    ok: true,
    updateAvailable,
    force: mustForce,
    minVersionCode,
    latestVersionCode,
    currentVersionCode,
    title,
    message,
    storeUrl,
  };
}

export async function openStoreUrl(url?: string | null) {
  if (!url) return;

  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }

    const supported = await Linking.canOpenURL(url);
    if (!supported) return;

    await Linking.openURL(url);
  } catch (e) {
    if (__DEV__) console.log('[versionCheck] openStoreUrl error', e);
  }
}
