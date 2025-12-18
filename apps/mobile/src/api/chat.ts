// apps/mobile/src/api/chat.ts
import { api } from '@/lib/api'
import type { ChatMessage, ChatThread, ChatThreadListItem } from '@/types/chat'

// 1) Asegurar/obtener thread de una orden
type EnsureOrderChatResp = {
  ok: boolean
  thread: ChatThread
}

export async function ensureOrderChat(orderId: string): Promise<ChatThread> {
  const res = await api.post<EnsureOrderChatResp>('/chat/ensure', { orderId })
  return res.data.thread
}

// 2) Listar mis hilos de chat
type ThreadsResp = {
  ok: boolean
  threads: ChatThreadListItem[]
}

export async function getMyChatThreads(): Promise<ChatThreadListItem[]> {
  const res = await api.get<ThreadsResp>('/chat/threads')
  return res.data.threads
}

// 3) Mensajes de un thread (paginados por cursor de fecha)
type MessagesResp = {
  ok: boolean
  messages: ChatMessage[]
}

export async function getMessages(
  threadId: string,
  cursor?: string
): Promise<ChatMessage[]> {
  const res = await api.get<MessagesResp>(`/chat/threads/${threadId}/messages`, {
    params: cursor ? { cursor } : undefined,
  })
  return res.data.messages
}

// 4) Enviar mensaje
type SendMessageResp = {
  ok: boolean
  message: ChatMessage
}

export async function sendMessage(
  threadId: string,
  text: string
): Promise<ChatMessage> {
  const res = await api.post<SendMessageResp>(
    `/chat/threads/${threadId}/messages`,
    { text }
  )
  return res.data.message
}




