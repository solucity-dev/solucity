// apps/mobile/src/navigation/SpecialistTabs.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatStack from './ChatStack';
import AgendaScreen from '../screens/AgendaScreen';
import BackgroundCheckScreen from '../screens/BackgroundCheckScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SpecialistHome from '../screens/SpecialistHome';

import type {
  AgendaStackParamList,
  SpecialistHomeStackParamList,
  ClientTabsParamList as SpecialistTabsParamList,
} from '../types';

const Tab = createBottomTabNavigator<SpecialistTabsParamList>();

const SpecialistHomeStack = createNativeStackNavigator<SpecialistHomeStackParamList>();

function SpecialistHomeStackNavigator() {
  return (
    <SpecialistHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <SpecialistHomeStack.Screen name="SpecialistHome" component={SpecialistHome} />
      <SpecialistHomeStack.Screen name="Notifications" component={NotificationsScreen} />
      <SpecialistHomeStack.Screen name="BackgroundCheck" component={BackgroundCheckScreen} />
    </SpecialistHomeStack.Navigator>
  );
}

const AgendaStack = createNativeStackNavigator<AgendaStackParamList>();
function SpecialistAgendaStackNavigator() {
  return (
    <AgendaStack.Navigator screenOptions={{ headerShown: false }}>
      <AgendaStack.Screen name="AgendaMain" component={AgendaScreen} />
      <AgendaStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </AgendaStack.Navigator>
  );
}

export default function SpecialistTabs() {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(12, insets.bottom + 12);

  const baseTabBarStyle = {
    position: 'absolute' as const,
    left: 14,
    right: 14,
    bottom: bottomGap,
    height: 70,
    paddingBottom: Math.max(10, insets.bottom * 0.5),
    paddingTop: 6,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 16,
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#0B6B76',
        tabBarInactiveTintColor: '#6B7B87',
        tabBarLabelStyle: { fontSize: 12, marginBottom: 10 },
        tabBarIcon: ({ color, size, focused }) => {
          size = 26;
          switch (route.name) {
            case 'Home':
              return (
                <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
              );
            case 'Agenda':
              return (
                <MaterialCommunityIcons
                  name={focused ? 'calendar-month' : 'calendar-month-outline'}
                  size={size}
                  color={color}
                />
              );
            case 'Chat':
              return (
                <Ionicons
                  name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                  size={size}
                  color={color}
                />
              );
            case 'Perfil':
              return (
                <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
              );
            default:
              return null;
          }
        },
      })}
    >
      {/* HOME especialista con comportamiento especial */}
      <Tab.Screen
        name="Home"
        component={SpecialistHomeStackNavigator}
        options={{
          tabBarLabel: 'Inicio',
          tabBarStyle: baseTabBarStyle,
        }}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('Home', {
              screen: 'SpecialistHome',
            });
          },
          focus: () => {
            const state = (route as any).state;
            const nestedIndex = state?.index ?? 0;
            if (nestedIndex > 0) {
              (navigation as any).navigate('Home', {
                screen: 'SpecialistHome',
              });
            }
          },
        })}
      />

      <Tab.Screen
        name="Agenda"
        component={SpecialistAgendaStackNavigator}
        options={{
          tabBarStyle: baseTabBarStyle,
        }}
      />

      {/* 🔹 Chat: ocultamos tab bar en ChatThread + tab → ChatList */}
      <Tab.Screen
        name="Chat"
        component={ChatStack}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'ChatList';
          const isChatThread = routeName === 'ChatThread';

          return {
            tabBarStyle: isChatThread ? { display: 'none' } : baseTabBarStyle,
          };
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('Chat', {
              screen: 'ChatList',
            });
          },
        })}
      />

      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
        options={{
          tabBarStyle: baseTabBarStyle,
        }}
      />
    </Tab.Navigator>
  );
}
