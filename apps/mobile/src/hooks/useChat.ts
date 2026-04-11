// apps/mobile/src/hooks/useChat.ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChatMessage, ChatThread } from '@/types/chat';

import { ensureInquiryChat, ensureOrderChat, getMessages, sendMessage } from '@/api/chat';

type UseChatArgs =
  | { orderId: string; threadId?: never; specialistId?: never; categorySlug?: never }
  | { orderId?: never; threadId: string; specialistId?: never; categorySlug?: never }
  | { orderId?: never; threadId?: never; specialistId: string; categorySlug?: string | null };

export function useChat({ orderId, threadId, specialistId, categorySlug }: UseChatArgs) {
  const hasOrder = !!orderId;
  const hasThread = !!threadId;
  const hasInquiryTarget = !!specialistId;

  // 1) Resolver / asegurar thread
  const threadQuery = useQuery<ChatThread>({
    queryKey: ['chat', 'thread', orderId ?? threadId ?? specialistId],
    enabled: !!orderId || !!threadId || !!specialistId,
    queryFn: async () => {
      // Si me pasan solo threadId (desde ChatList), no necesito crear nada
      if (hasThread && !hasOrder && !hasInquiryTarget) {
        return {
          id: threadId!,
          orderId: null,
          createdAt: new Date().toISOString(),
        } as ChatThread;
      }

      // Si viene desde una orden, aseguro chat ORDER
      if (hasOrder) {
        return ensureOrderChat(orderId!);
      }

      // Si viene desde perfil especialista, aseguro chat INQUIRY
      return ensureInquiryChat(specialistId!, categorySlug ?? null);
    },
  });

  const effectiveThreadId = threadQuery.data?.id ?? threadId;

  // 2) Mensajes (infinite query por cursor de fecha)
  const messagesQuery = useInfiniteQuery<ChatMessage[]>({
    queryKey: ['chat', 'messages', effectiveThreadId],
    enabled: !!effectiveThreadId,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      // Devuelve directamente un array de mensajes
      return getMessages(effectiveThreadId!, cursor);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1];
      return last ? last.createdAt : undefined;
    },
    // ⏱️ Polling suave para que aparezcan los mensajes del otro sin tocar nada
    refetchInterval: effectiveThreadId ? 2500 : false,
    refetchIntervalInBackground: !!effectiveThreadId,
  });

  const qc = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: (text: string) => {
      if (!effectiveThreadId) {
        throw new Error('No hay threadId disponible para este chat');
      }
      return sendMessage(effectiveThreadId, text);
    },
    onSuccess: () => {
      if (effectiveThreadId) {
        qc.invalidateQueries({
          queryKey: ['chat', 'messages', effectiveThreadId],
        });
      }
    },
  });

  const flatMessages: ChatMessage[] =
    messagesQuery.data?.pages.flatMap((page) => (Array.isArray(page) ? page : [])) ?? [];

  return {
    thread: threadQuery.data ?? null,
    isThreadLoading: threadQuery.isLoading,

    messages: flatMessages,
    messagesQuery,

    sendMessage: sendMutation.mutateAsync,
    sending: (sendMutation as any).isPending ?? (sendMutation as any).isLoading ?? false,
  };
}
