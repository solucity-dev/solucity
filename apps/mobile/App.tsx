// apps/mobile/App.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import * as Font from 'expo-font';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthProvider';
import { queryClient } from './src/lib/reactQuery';
import RootNavigator from './src/navigation/RootNavigator';

// React Query

// 🔔 provider de notificaciones

import { flushPendingNav, navigationRef } from './src/navigation/navigationRef';
import { NotificationsProvider } from './src/notifications/NotificationsProvider';

// ✅ NUEVO: navigationRef global

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // ⚠️ tenías shouldShowAlert (deprecated). Igual no rompe, pero ya estás usando banner/list.
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  const [fontsReady, setFontsReady] = useState(false);

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

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationsProvider>
          <SafeAreaProvider>
            <StatusBar style="light" />

            {/* ✅ CLAVE: NavigationContainer con ref + onReady */}
            <NavigationContainer
              ref={navigationRef}
              onReady={() => {
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
  );
}
