// apps/mobile/src/navigation/RootNavigator.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';

import ClientTabs from './ClientTabs';
import { setNavRole } from './navigationRef';
import SpecialistTabs from './SpecialistTabs';
import { useAuth } from '../auth/AuthProvider';
import ChooseRole from '../screens/ChooseRole';
import ForgotPassword from '../screens/ForgotPassword';
import KycStatusScreen from '../screens/KycStatusScreen';
import KycUploadScreen from '../screens/KycUploadScreen';
import LoginScreen from '../screens/LoginScreen';
import Onboarding from '../screens/Onboarding';
import RegisterClient from '../screens/RegisterClient';
import RegisterSpecialist from '../screens/RegisterSpecialist';
import ResetPassword from '../screens/ResetPassword';
import SpecialistWizard from '../screens/SpecialistWizard';
import Splash from '../screens/Splash';
import Welcome from '../screens/Welcome';

const Stack = createNativeStackNavigator();
const ONBOARDING_KEY = 'onboarding:seen';

export default function RootNavigator() {
  const { token, loading, user } = useAuth();
  const [bootReady, setBootReady] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    setNavRole(user?.role ?? null);
  }, [user?.role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!cancelled) setOnboardingSeen(seen === '1');
      } finally {
        if (!cancelled) setBootReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mientras hidrata auth + onboarding, mostramos splash
  if (loading || !bootReady || onboardingSeen === null) {
    return <Splash duration={1200} />;
  }

  // ✅ Con token → stack privado (PERO solo cuando ya tenemos user)
  // Esto elimina el flash al Home cliente mientras /auth/me todavía está cargando.
  if (token) {
    if (!user) {
      return <Splash duration={1200} />;
    }

    const isSpecialist = user.role === 'SPECIALIST';

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSpecialist ? (
          <Stack.Screen name="MainSpecialist" component={SpecialistTabs} />
        ) : (
          <Stack.Screen name="Main" component={ClientTabs} />
        )}

        {/* ✅ Global: accesible desde cualquier lado (Home/Perfil/etc) */}
        <Stack.Screen name="KycStatus" component={KycStatusScreen} />
        <Stack.Screen name="KycUpload" component={KycUploadScreen} />
      </Stack.Navigator>
    );
  }

  // Sin token → flujo público
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={onboardingSeen ? 'Welcome' : 'Onboarding'}
    >
      <Stack.Screen
        name="Onboarding"
        children={({ navigation }) => (
          <Onboarding
            onFinish={async () => {
              try {
                await AsyncStorage.setItem(ONBOARDING_KEY, '1');
              } finally {
                setOnboardingSeen(true);
                navigation.replace('Welcome');
              }
            }}
          />
        )}
      />

      <Stack.Screen
        name="Welcome"
        children={({ navigation }) => (
          <Welcome
            onCreateAccount={() => navigation.navigate('ChooseRole')}
            onLogin={() => navigation.navigate('Login')}
            onOpenTerms={() => {}}
          />
        )}
      />

      <Stack.Screen name="Login" component={LoginScreen} />

      {/* ✅ Recuperación de contraseña */}
      <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
      <Stack.Screen name="ResetPassword" component={ResetPassword} />

      <Stack.Screen
        name="ChooseRole"
        children={({ navigation }) => (
          <ChooseRole
            onBack={() => navigation.goBack()}
            onPickClient={() => navigation.navigate('RegisterClient')}
            onPickPro={() => navigation.navigate('RegisterSpecialist')}
          />
        )}
      />

      <Stack.Screen name="RegisterClient" component={RegisterClient} />
      <Stack.Screen name="RegisterSpecialist" component={RegisterSpecialist} />

      <Stack.Screen
        name="SpecialistWizard"
        children={({ navigation }) => (
          <SpecialistWizard onClose={() => navigation.replace('Welcome')} />
        )}
      />
    </Stack.Navigator>
  );
}
