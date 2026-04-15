// apps/mobile/src/navigation/RootNavigator.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import ClientTabs from './ClientTabs';
import GuestNavigator from './GuestNavigator';
import { setNavMode } from './navigationRef';
import SpecialistTabs from './SpecialistTabs';
import { useAuth } from '../auth/AuthProvider';
import ChooseRole from '../screens/ChooseRole';
import ForgotPassword from '../screens/ForgotPassword';
import KycStatusScreen from '../screens/KycStatusScreen';
import KycUploadScreen from '../screens/KycUploadScreen';
import PrivacyPolicyScreen from '../screens/legal/PrivacyPolicyScreen';
import SupportScreen from '../screens/legal/SupportScreen';
import TermsScreen from '../screens/legal/TermsScreen';
import LoginScreen from '../screens/LoginScreen';
import Onboarding from '../screens/Onboarding';
import RegisterClient from '../screens/RegisterClient';
import RegisterSpecialist from '../screens/RegisterSpecialist';
import ResetPassword from '../screens/ResetPassword';
import SelfieCaptureScreen from '../screens/SelfieCaptureScreen';
import SpecialistWizard from '../screens/SpecialistWizard';
import Splash from '../screens/Splash';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import Welcome from '../screens/Welcome';

const Stack = createNativeStackNavigator();

const ONBOARDING_KEY = 'onboarding:seen';
const REGISTER_DRAFT_KEY = 'register_specialist_draft_v1';

export default function RootNavigator() {
  const { token, loading, user, mode } = useAuth();

  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [isGuestExploring, setIsGuestExploring] = useState(false);

  useEffect(() => {
    if (!user) {
      setNavMode(null);
      return;
    }

    const canUseSpecialistMode = !!(user as any)?.profiles?.specialistId;
    const navMode = canUseSpecialistMode && mode === 'specialist' ? 'specialist' : 'client';

    setNavMode(navMode);
  }, [user, mode]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!cancelled) setOnboardingSeen(seen === '1');
      } catch {
        if (!cancelled) setOnboardingSeen(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (onboardingSeen === null) return;

    let cancelled = false;

    const resolveInitialRoute = async () => {
      try {
        const draftRaw = await AsyncStorage.getItem(REGISTER_DRAFT_KEY);

        if (draftRaw) {
          const draft = JSON.parse(draftRaw);

          const hasDraft =
            !!draft?.pendingToken ||
            !!draft?.dniFront ||
            !!draft?.dniBack ||
            !!draft?.selfie ||
            draft?.step === 2 ||
            draft?.step === 3;

          if (hasDraft) {
            console.log('[RootNavigator] draft detectado → ir a RegisterSpecialist');
            if (!cancelled) setInitialRoute('RegisterSpecialist');
            return;
          }
        }

        console.log('[RootNavigator] sin draft → flujo normal');
        if (!cancelled) {
          setInitialRoute(onboardingSeen ? 'Welcome' : 'Onboarding');
        }
      } catch (e) {
        console.log('[RootNavigator] error leyendo draft', e);
        if (!cancelled) {
          setInitialRoute(onboardingSeen ? 'Welcome' : 'Onboarding');
        }
      }
    };

    resolveInitialRoute();

    return () => {
      cancelled = true;
    };
  }, [onboardingSeen]);

  useEffect(() => {
    if (token && user) {
      setIsGuestExploring(false);
    }
  }, [token, user]);

  if (loading || onboardingSeen === null) {
    return Platform.OS === 'web' ? <Splash /> : null;
  }

  if (token && !user) {
    return Platform.OS === 'web' ? <Splash /> : null;
  }

  if (token && user) {
    const canUseSpecialistMode = !!(user as any)?.profiles?.specialistId;
    const isSpecialistMode = canUseSpecialistMode && mode === 'specialist';

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSpecialistMode ? (
          <Stack.Screen name="MainSpecialist" component={SpecialistTabs} />
        ) : (
          <Stack.Screen name="Main" component={ClientTabs} />
        )}

        <Stack.Screen name="KycStatus" component={KycStatusScreen} />
        <Stack.Screen name="KycUpload" component={KycUploadScreen} />

        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      </Stack.Navigator>
    );
  }

  if (isGuestExploring) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="GuestMain" component={GuestNavigator} />
        <Stack.Screen name="Login" component={LoginScreen} />
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
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      </Stack.Navigator>
    );
  }

  if (!initialRoute) {
    return Platform.OS === 'web' ? <Splash /> : null;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen
        name="Onboarding"
        children={({ navigation }) => (
          <Onboarding
            onFinish={async () => {
              try {
                await AsyncStorage.setItem(ONBOARDING_KEY, '1');
              } catch {}
              setOnboardingSeen(true);
              navigation.replace('Welcome');
            }}
          />
        )}
      />

      <Stack.Screen
        name="Welcome"
        children={({ navigation }) => (
          <Welcome
            onExplore={() => setIsGuestExploring(true)}
            onCreateAccount={() => navigation.navigate('ChooseRole')}
            onLogin={() => navigation.navigate('Login')}
            onOpenTerms={() => navigation.navigate('Terms')}
            onOpenPrivacy={() => navigation.navigate('PrivacyPolicy')}
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
      <Stack.Screen name="SelfieCapture" component={SelfieCaptureScreen} />

      <Stack.Screen
        name="SpecialistWizard"
        children={({ navigation }) => (
          <SpecialistWizard onClose={() => navigation.replace('Welcome')} />
        )}
      />

      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}
