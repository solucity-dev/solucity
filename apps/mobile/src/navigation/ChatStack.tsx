// apps/mobile/src/navigation/ChatStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ChatListScreen from '@/screens/ChatListScreen';
import ChatThreadScreen from '@/screens/ChatThreadScreen';
import type { ChatStackParamList } from '@/types';

const Stack = createNativeStackNavigator<ChatStackParamList>();

export default function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
    </Stack.Navigator>
  );
}
