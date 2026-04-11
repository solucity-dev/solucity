// apps/mobile/src/screens/ChatThreadScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage, ChatStackParamList } from '@/types/chat';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '@/auth/AuthProvider';
import { useChat } from '@/hooks/useChat';

type RouteT = RouteProp<ChatStackParamList, 'ChatThread'>;
type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatThread'>;

export default function ChatThreadScreen() {
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteT>();
  const nav = useNavigation<Nav>();
  const { mode } = useAuth();

  const [text, setText] = useState('');

  const { messages, messagesQuery, sendMessage, sending } = useChat(
    params.orderId
      ? {
          orderId: params.orderId,
        }
      : params.threadId
        ? {
            threadId: params.threadId,
          }
        : {
            specialistId: params.specialistId!,
            categorySlug: params.categorySlug ?? null,
          },
  );

  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    try {
      await sendMessage(trimmed);
    } catch (e) {
      console.warn('Error al enviar mensaje', e);
      setText(trimmed);
    }
  };

  const businessName =
    typeof params.businessName === 'string' && params.businessName.trim()
      ? params.businessName.trim()
      : null;

  const threadType = params.threadType ?? (params.orderId ? 'ORDER' : 'INQUIRY');
  const isInquiryThread = threadType === 'INQUIRY';
  const canCreateOrderFromChat = isInquiryThread && mode === 'client';

  const title = businessName ?? params.title ?? 'Chat';
  const hasMessages = (messages ?? []).length > 0;
  // 👉 función centralizada para "volver al listado de chats"
  const goBackToChatList = useCallback(() => {
    const parent = (nav as any).getParent?.(); // Tabs

    if (parent?.navigate) {
      parent.navigate('Chat', {
        screen: 'ChatList',
      });
      return true;
    }

    if (nav.canGoBack()) {
      nav.goBack();
      return true;
    }

    return false;
  }, [nav]);

  // 👉 ir al detalle del pedido asociado (si hay orderId)
  const handleGoToOrderDetail = useCallback(() => {
    if (!params.orderId) return;

    const parent = (nav as any).getParent?.(); // Tabs

    if (parent?.navigate) {
      parent.navigate('Agenda', {
        screen: 'OrderDetail',
        params: { id: params.orderId },
      });
      return;
    }

    // fallback ultra defensivo (no debería usarse casi nunca)
    (nav as any).navigate('Agenda', {
      screen: 'OrderDetail',
      params: { id: params.orderId },
    });
  }, [nav, params.orderId]);

  const handleGoToCreateOrder = useCallback(() => {
    if (!params.specialistId) return;

    const parent = (nav as any).getParent?.();

    if (parent?.navigate) {
      parent.navigate('Home', {
        screen: 'CreateOrder',
        params: {
          specialistId: params.specialistId,
          specialistName: businessName ?? params.title ?? 'Especialista',
          categorySlug: params.categorySlug ?? null,
        },
      });
      return;
    }

    (nav as any).navigate('CreateOrder', {
      specialistId: params.specialistId,
      specialistName: businessName ?? params.title ?? 'Especialista',
      categorySlug: params.categorySlug ?? null,
    });
  }, [nav, params.specialistId, params.categorySlug, businessName, params.title]);

  // ✅ Interceptamos el botón físico de "back" en Android
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const sub = BackHandler.addEventListener('hardwareBackPress', () => goBackToChatList());
      return () => sub.remove();
    }, [goBackToChatList]),
  );

  // 👇 Usamos SOLO el safe area inferior (nada de tabBarHeight)
  const bottomPadding = 8 + insets.bottom;

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Back → siempre a ChatList */}
          <Pressable onPress={goBackToChatList} style={{ padding: 4, marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color="#E9FEFF" />
          </Pressable>

          {/* Título centrado */}
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              color: '#E9FEFF',
              fontSize: 18,
              fontWeight: '800',
            }}
            numberOfLines={1}
          >
            {title}
          </Text>

          {/* Botón "Ver pedido" si hay orderId, sino un spacer para equilibrar */}
          {params.orderId ? (
            <Pressable onPress={handleGoToOrderDetail} style={{ padding: 4, marginLeft: 8 }}>
              <Ionicons name="document-text-outline" size={22} color="#E9FEFF" />
            </Pressable>
          ) : (
            <View style={{ width: 30 }} />
          )}
        </View>

        {/* Lista de mensajes */}
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          {canCreateOrderFromChat && (
            <View
              style={{
                marginBottom: 10,
                padding: 12,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(233,254,255,0.18)',
              }}
            >
              <Text
                style={{
                  color: '#E9FEFF',
                  fontWeight: '800',
                  marginBottom: 8,
                }}
              >
                Esta es una consulta previa sin compromiso.
              </Text>

              <Text
                style={{
                  color: 'rgba(233,254,255,0.88)',
                  marginBottom: 10,
                }}
              >
                Si ya te cerró el precio o querés avanzar, podés formalizar la contratación desde
                acá.
              </Text>

              <Pressable
                onPress={handleGoToCreateOrder}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#E9FEFF',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    color: '#06494F',
                    fontWeight: '900',
                  }}
                >
                  Solicitar contratación
                </Text>
              </Pressable>
            </View>
          )}
          {messagesQuery.isLoading && (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color="#E9FEFF" />
              <Text
                style={{
                  color: '#E9FEFF',
                  marginTop: 8,
                }}
              >
                Cargando conversación…
              </Text>
            </View>
          )}

          {!messagesQuery.isLoading && !hasMessages && (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 32,
              }}
            >
              <Text
                style={{
                  color: 'rgba(233,254,255,0.9)',
                  textAlign: 'center',
                }}
              >
                Todavía no hay mensajes. Escribí el primero para empezar la conversación.
              </Text>
            </View>
          )}

          {!messagesQuery.isLoading && hasMessages && (
            <FlatList
              ref={flatListRef}
              data={messages}
              inverted
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8, gap: 6 }}
              initialNumToRender={15}
              maxToRenderPerBatch={20}
              windowSize={10}
              removeClippedSubviews={Platform.OS === 'android'}
              onContentSizeChange={() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
              }}
              renderItem={({ item }) => {
                // Lado definido POR EL BACKEND
                const isMine = (item as any).isMine === true;

                return (
                  <View
                    style={{
                      alignSelf: isMine ? 'flex-end' : 'flex-start',
                      marginVertical: 2,
                    }}
                  >
                    <View
                      style={{
                        maxWidth: '75%',
                        backgroundColor: isMine
                          ? '#E9FEFF' // mis mensajes (claro)
                          : 'rgba(0, 35, 40, 0.45)', // del otro (oscuro)
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 16,
                      }}
                    >
                      <Text
                        style={{
                          color: isMine ? '#06494F' : '#E9FEFF',
                        }}
                      >
                        {item.body}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* Input / enviar */}
        <View
          style={{
            paddingHorizontal: 12,
            paddingBottom: bottomPadding,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: 'rgba(233,254,255,0.2)',
            backgroundColor: 'rgba(0, 25, 32, 0.5)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <TextInput
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
            placeholder="Escribí un mensaje…"
            placeholderTextColor="#7A8B90"
            value={text}
            onChangeText={setText}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !text.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sending || !text.trim() ? 'rgba(233,254,255,0.4)' : '#E9FEFF',
            }}
          >
            {sending ? (
              <ActivityIndicator color="#06494F" />
            ) : (
              <Ionicons name="send" size={18} color="#06494F" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
