// apps/mobile/src/hooks/useChat.ts
import { ensureOrderChat, getMessages, sendMessage } from '@/api/chat';
import type { ChatMessage, ChatThread } from '@/types/chat';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

type UseChatArgs =
  | { orderId: string; threadId?: never }
  | { orderId?: never; threadId: string }

export function useChat({ orderId, threadId }: UseChatArgs) {
  const hasOrder = !!orderId
  const hasThread = !!threadId

  // 1) Resolver / asegurar thread
  const threadQuery = useQuery<ChatThread>({
    queryKey: ['chat', 'thread', orderId ?? threadId],
    enabled: hasOrder || hasThread,
    queryFn: async () => {
      // Si me pasan solo threadId (desde ChatList), no necesito crear nada
      if (hasThread && !hasOrder) {
        return {
          id: threadId!,
          orderId: '',
          createdAt: new Date().toISOString(),
        } as ChatThread
      }
      // Si viene desde una orden, aseguro que exista el chat
      return ensureOrderChat(orderId!)
    },
  })

  const effectiveThreadId = threadQuery.data?.id ?? threadId

  // 2) Mensajes (infinite query por cursor de fecha)
  const messagesQuery = useInfiniteQuery<ChatMessage[]>({
    queryKey: ['chat', 'messages', effectiveThreadId],
    enabled: !!effectiveThreadId,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined
      // Devuelve directamente un array de mensajes
      return getMessages(effectiveThreadId!, cursor)
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      return last ? last.createdAt : undefined
    },
    // ⏱️ Polling suave para que aparezcan los mensajes del otro sin tocar nada
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
  })

  const qc = useQueryClient()

  const sendMutation = useMutation({
    mutationFn: (text: string) => {
      if (!effectiveThreadId) {
        throw new Error('No hay threadId disponible para este chat')
      }
      return sendMessage(effectiveThreadId, text)
    },
    onSuccess: () => {
      if (effectiveThreadId) {
        qc.invalidateQueries({
          queryKey: ['chat', 'messages', effectiveThreadId],
        })
      }
    },
  })

  const flatMessages: ChatMessage[] =
    messagesQuery.data?.pages.reduce<ChatMessage[]>(
      (acc, page) => acc.concat(page),
      [],
    ) ?? []

  return {
    thread: threadQuery.data ?? null,
    isThreadLoading: threadQuery.isLoading,

    messages: flatMessages,
    messagesQuery,

    sendMessage: sendMutation.mutateAsync,
    sending:
      (sendMutation as any).isPending ??
      (sendMutation as any).isLoading ??
      false,
  }
}






