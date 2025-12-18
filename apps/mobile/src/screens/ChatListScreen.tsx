// apps/mobile/src/screens/ChatListScreen.tsx
import { useChatThreads } from '@/hooks/useChatThreads'
import { api } from '@/lib/api'
import type { ChatStackParamList } from '@/types/chat'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Image as ExpoImage } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatList'>

// misma función que usás en ProfileScreen / SpecialistHome
function absoluteUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('/')) {
    const base = api.defaults.baseURL ?? ''
    return `${base.replace(/\/+$/, '')}${u}`
  }
  return u
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<Nav>()
  const { data, isLoading, refetch } = useChatThreads()

  const threads = useMemo(() => data ?? [], [data])

  const handleDeleteThread = async (threadId: string) => {
    try {
      await api.delete(`/chat/threads/${threadId}`)
      await refetch()
    } catch (e: any) {
      console.log(
        '[ChatList] error deleting thread',
        e?.response?.status,
        e?.message
      )
      Alert.alert(
        'Error',
        'No se pudo eliminar la conversación. Intentá de nuevo más tarde.'
      )
    }
  }

  if (isLoading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color="#E9FEFF" />
          <Text style={{ color: '#E9FEFF', marginTop: 8 }}>
            Cargando chats…
          </Text>
        </View>
      </LinearGradient>
    )
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{ color: '#E9FEFF', fontSize: 22, fontWeight: '900' }}
        >
          Chats
        </Text>

        <Pressable onPress={() => refetch()}>
          <Text
            style={{
              color: '#E9FEFF',
              fontWeight: '800',
            }}
          >
            ↻
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 10,
        }}
        ListEmptyComponent={
          <View
            style={{ flex: 1, alignItems: 'center', marginTop: 40 }}
          >
            <Text style={{ color: '#E9FEFF', opacity: 0.9 }}>
              Todavía no tenés conversaciones.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const counterpartName = item.counterpart?.name ?? 'Contacto'

          const rawAvatar = (item as any).counterpart?.avatarUrl ?? null
          const avatarUrl = rawAvatar ? absoluteUrl(rawAvatar) : undefined

          const rubro = '' // si en algún momento querés volver a mostrar el rubro, lo podés usar acá

          const lastText = item.lastMessage?.text ?? ''
          const lastFrom = item.lastMessage?.senderName ?? ''

          const lastLine = lastText
            ? lastFrom
              ? `${lastFrom}: ${lastText}`
              : lastText
            : 'Sin mensajes aún'

          const initial =
            counterpartName.trim().charAt(0).toUpperCase() || '?'

          const orderId =
            (item as any).orderId ??
            (item as any).order?.id ??
            undefined

          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {/* Card del chat (tappable) */}
              <Pressable
                onPress={() =>
                  nav.navigate('ChatThread', {
                    threadId: item.id,
                    orderId,
                    title: counterpartName,
                  })
                }
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0, 35, 40, 0.35)',
                  borderRadius: 18,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                {/* Avatar */}
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    borderWidth: 2,
                    borderColor: '#FFE164',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(0,35,40,0.7)',
                  }}
                >
                  {avatarUrl ? (
                    <ExpoImage
                      source={{ uri: avatarUrl }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <Text
                      style={{
                        color: '#FFE164',
                        fontWeight: '900',
                        fontSize: 18,
                      }}
                    >
                      {initial}
                    </Text>
                  )}
                </View>

                {/* Texto */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: '#E9FEFF',
                      fontWeight: '800',
                      fontSize: 16,
                      marginBottom: rubro ? 2 : 0,
                    }}
                    numberOfLines={1}
                  >
                    {counterpartName}
                  </Text>

                  {rubro ? (
                    <Text
                      style={{
                        color: 'rgba(233,254,255,0.9)',
                        fontWeight: '600',
                        marginBottom: 2,
                      }}
                      numberOfLines={1}
                    >
                      {rubro}
                    </Text>
                  ) : null}

                  <Text
                    numberOfLines={1}
                    style={{
                      color: 'rgba(233,254,255,0.8)',
                      fontSize: 13,
                    }}
                  >
                    {lastLine}
                  </Text>
                </View>
              </Pressable>

              {/* Botón de borrar */}
              <Pressable
                onPress={() => {
                  Alert.alert(
                    'Eliminar chat',
                    '¿Querés eliminar esta conversación? Esta acción no se puede deshacer.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Eliminar',
                        style: 'destructive',
                        onPress: () => handleDeleteThread(item.id),
                      },
                    ]
                  )
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(192, 57, 43, 0.9)',
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#E9FEFF" />
              </Pressable>
            </View>
          )
        }}
        onRefresh={refetch}
        refreshing={false}
      />
    </LinearGradient>
  )
}



