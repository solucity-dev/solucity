//apps/mobile/src/navigation/GuestNavigator.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CategoryScreen from '../screens/CategoryScreen';
import ClientHome from '../screens/ClientHome';
import SpecialistProfileScreen from '../screens/SpecialistProfileScreen';
import SpecialistsListScreen from '../screens/SpecialistsListScreen';

import type { HomeStackParamList } from '../types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function GuestNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientHome" component={ClientHome} />
      <Stack.Screen name="Category" component={CategoryScreen} />
      <Stack.Screen name="SpecialistsList" component={SpecialistsListScreen} />
      <Stack.Screen name="SpecialistProfile" component={SpecialistProfileScreen} />
    </Stack.Navigator>
  );
}
