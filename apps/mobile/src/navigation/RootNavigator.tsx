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
// import KycUploadScreen from '../screens/KycUploadScreen'; // ✅ si existe en tu proyecto, descomentá
import PrivacyPolicyScreen from '../screens/legal/PrivacyPolicyScreen';
import SupportScreen from '../screens/legal/SupportScreen';
import TermsScreen from '../screens/legal/TermsScreen';
import LoginScreen from '../screens/LoginScreen';
import Onboarding from '../screens/Onboarding';
import RegisterClient from '../screens/RegisterClient';
import RegisterSpecialist from '../screens/RegisterSpecialist';
import ResetPassword from '../screens/ResetPassword';
import SpecialistWizard from '../screens/SpecialistWizard';
import Splash from '../screens/Splash';
import SubscriptionScreen from '../screens/SubscriptionScreen';
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

  // ✅ Mientras hidrata auth + onboarding, mostramos splash
  if (loading || !bootReady || onboardingSeen === null) {
    return <Splash duration={1200} />;
  }

  // ✅ Anti-flash: si hay token pero aún no cargó user (/auth/me)
  if (token && !user) {
    return <Splash duration={600} />;
  }

  // ✅ Con token → stack privado (según role real)
  if (token && user) {
    const isSpecialist = user.role === 'SPECIALIST';

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSpecialist ? (
          <Stack.Screen name="MainSpecialist" component={SpecialistTabs} />
        ) : (
          <Stack.Screen name="Main" component={ClientTabs} />
        )}

        {/* ✅ Global */}
        <Stack.Screen name="KycStatus" component={KycStatusScreen} />
        {/* <Stack.Screen name="KycUpload" component={KycUploadScreen} /> */}

        {/* ✅ Legal + soporte global */}
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      </Stack.Navigator>
    );
  }

  // ✅ Sin token → flujo público
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
            onOpenTerms={() => navigation.navigate('Terms')}
          />
        )}
      />

      <Stack.Screen name="Login" component={LoginScreen} />

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

      {/* ✅ Legal + soporte global */}
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}
