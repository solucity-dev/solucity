// apps/mobile/App.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import * as Font from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthProvider';
import { queryClient } from './src/lib/reactQuery';
import { checkAppVersion, openStoreUrl, type VersionCheckResult } from './src/lib/versionCheck';
import { flushPendingNav, navigationRef } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation/RootNavigator';
import { NotificationsProvider } from './src/notifications/NotificationsProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsReady, setFontsReady] = useState(false);
  const [versionLoading, setVersionLoading] = useState(true);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [dismissedSoftUpdate, setDismissedSoftUpdate] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await Font.loadAsync({
          ...Ionicons.font,
          ...MaterialCommunityIcons.font,
        });
      } finally {
        if (!cancelled) setFontsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await checkAppVersion();
        if (!cancelled) {
          setVersionInfo(result);
        }
      } catch (e) {
        if (__DEV__) console.log('[versionCheck] error', e);
        if (!cancelled) {
          setVersionInfo(null);
        }
      } finally {
        if (!cancelled) {
          setVersionLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!fontsReady || versionLoading) {
    return null;
  }

  const showSoftUpdate =
    !!versionInfo?.updateAvailable && !versionInfo?.force && !dismissedSoftUpdate;

  const showForceUpdate = !!versionInfo?.updateAvailable && !!versionInfo?.force;

  return (
    <View style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationsProvider>
            <SafeAreaProvider>
              <StatusBar style="light" />

              <NavigationContainer
                ref={navigationRef}
                onReady={() => {
                  SplashScreen.hideAsync().catch(() => {});
                  if (__DEV__) console.log('[NAV] ready -> flushPendingNav()');
                  flushPendingNav();
                }}
              >
                <RootNavigator />
              </NavigationContainer>
            </SafeAreaProvider>
          </NotificationsProvider>
        </AuthProvider>
      </QueryClientProvider>

      <Modal visible={showSoftUpdate} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: '#E9FEFF',
              borderRadius: 18,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#06494F' }}>
              {versionInfo?.title ?? 'Nueva actualización disponible'}
            </Text>

            <Text style={{ marginTop: 10, color: '#355E63', lineHeight: 22 }}>
              {versionInfo?.message ??
                'Actualizá Solucity para seguir usando la última versión disponible.'}
            </Text>

            <Pressable
              onPress={() => openStoreUrl(versionInfo?.storeUrl)}
              style={{
                marginTop: 16,
                backgroundColor: '#06494F',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>Actualizar ahora</Text>
            </Pressable>

            <Pressable
              onPress={() => setDismissedSoftUpdate(true)}
              style={{
                marginTop: 10,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                backgroundColor: 'rgba(6,73,79,0.08)',
              }}
            >
              <Text style={{ color: '#06494F', fontWeight: '800' }}>Más tarde</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showForceUpdate} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: '#E9FEFF',
              borderRadius: 18,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#06494F' }}>
              {versionInfo?.title ?? 'Actualización obligatoria'}
            </Text>

            <Text style={{ marginTop: 10, color: '#355E63', lineHeight: 22 }}>
              {versionInfo?.message ??
                'Necesitás actualizar Solucity para continuar usando la app.'}
            </Text>

            <Pressable
              onPress={() => openStoreUrl(versionInfo?.storeUrl)}
              style={{
                marginTop: 16,
                backgroundColor: '#06494F',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#E9FEFF', fontWeight: '800' }}>Actualizar app</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
