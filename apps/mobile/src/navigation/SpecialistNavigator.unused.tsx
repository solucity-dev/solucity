// SpecialistNavigation.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SpecialistTabs from './SpecialistTabs';
import SpecialistSettings from '../screens/SpecialistSettings';

const Stack = createNativeStackNavigator();

export default function SpecialistNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Tabs con Inicio / Agenda / Chat / Mi perfil */}
      <Stack.Screen name="SpecialistTabs" component={SpecialistTabs} />
      {/* Pantalla “Ajustes de cuenta” (no es tab) */}
      <Stack.Screen name="SpecialistSettings" component={SpecialistSettings} />
    </Stack.Navigator>
  );
}
