// apps/mobile/src/navigation/RootNavigator.tsx
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthProvider'

import ClientTabs from './ClientTabs'
import SpecialistTabs from './SpecialistTabs'

import ChooseRole from '../screens/ChooseRole'
import LoginScreen from '../screens/LoginScreen'
import Onboarding from '../screens/Onboarding'
import RegisterClient from '../screens/RegisterClient'
import RegisterSpecialist from '../screens/RegisterSpecialist'
import SpecialistWizard from '../screens/SpecialistWizard'
import Splash from '../screens/Splash'
import Welcome from '../screens/Welcome'
import { setNavRole } from './navigationRef'


const Stack = createNativeStackNavigator()
const ONBOARDING_KEY = 'onboarding:seen'

export default function RootNavigator() {
  const { token, loading, user } = useAuth()
  const [bootReady, setBootReady] = useState(false)
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null)

  useEffect(() => {
    setNavRole(user?.role ?? null)
  }, [user?.role])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY)
        if (!cancelled) setOnboardingSeen(seen === '1')
      } finally {
        if (!cancelled) setBootReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Mientras hidrata auth + onboarding, mostramos splash
  if (loading || !bootReady || onboardingSeen === null) {
    return <Splash duration={1200} />
  }

  // Con token → stack privado (según role real)
  if (token) {
    const isSpecialist = user?.role === 'SPECIALIST'

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSpecialist ? (
          <Stack.Screen name="MainSpecialist" component={SpecialistTabs} />
        ) : (
          <Stack.Screen name="Main" component={ClientTabs} />
        )}
      </Stack.Navigator>
    )
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
                await AsyncStorage.setItem(ONBOARDING_KEY, '1')
              } finally {
                setOnboardingSeen(true)
                navigation.replace('Welcome')
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
  )
}












