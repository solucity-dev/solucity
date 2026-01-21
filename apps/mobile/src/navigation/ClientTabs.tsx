// apps/mobile/src/navigation/ClientTabs.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatStack from './ChatStack';
import AgendaScreen from '../screens/AgendaScreen';
import CategoryScreen from '../screens/CategoryScreen';
import ClientHome from '../screens/ClientHome';
import CreateOrderScreen from '../screens/CreateOrderScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SpecialistProfileScreen from '../screens/SpecialistProfileScreen';
import SpecialistsListScreen from '../screens/SpecialistsListScreen';

import type { AgendaStackParamList, ClientTabsParamList, HomeStackParamList } from '../types';

const Tab = createBottomTabNavigator<ClientTabsParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const AgendaStack = createNativeStackNavigator<AgendaStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="ClientHome" component={ClientHome} />
      <HomeStack.Screen name="Category" component={CategoryScreen} />
      <HomeStack.Screen name="SpecialistsList" component={SpecialistsListScreen} />
      <HomeStack.Screen name="SpecialistProfile" component={SpecialistProfileScreen} />

      <HomeStack.Screen
        name="CreateOrder"
        component={CreateOrderScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />

      <HomeStack.Screen name="Orders" component={OrdersScreen} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} />
    </HomeStack.Navigator>
  );
}

function ClientAgendaStackNavigator() {
  return (
    <AgendaStack.Navigator screenOptions={{ headerShown: false }}>
      <AgendaStack.Screen name="AgendaMain" component={AgendaScreen} />
      <AgendaStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </AgendaStack.Navigator>
  );
}

export default function ClientTabs() {
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
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Inicio',
          tabBarStyle: baseTabBarStyle,
        }}
      />

      <Tab.Screen
        name="Agenda"
        component={ClientAgendaStackNavigator}
        options={{
          tabBarStyle: baseTabBarStyle,
        }}
      />

      {/* 🔹 Chat: ocultamos tab bar en ChatThread + siempre tab → ChatList */}
      <Tab.Screen
        name="Chat"
        component={ChatStack}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'ChatList';
          const isChatThread = routeName === 'ChatThread';

          return {
            tabBarStyle: isChatThread
              ? { display: 'none' } // 👉 oculta el menú dentro del chat
              : baseTabBarStyle,
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
        options={{ tabBarStyle: baseTabBarStyle }}
      />
    </Tab.Navigator>
  );
}
