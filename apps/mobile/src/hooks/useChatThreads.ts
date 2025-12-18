// apps/mobile/src/hooks/useChatThreads.ts
import { getMyChatThreads } from '@/api/chat'
import type { ChatThreadListItem } from '@/types/chat'
import { useQuery } from '@tanstack/react-query'

export function useChatThreads() {
  const query = useQuery<ChatThreadListItem[]>({
    queryKey: ['chat', 'threads'],
    queryFn: getMyChatThreads,
    staleTime: 15_000,
  })

  return {
    ...query,
    threads: query.data ?? [],
  }
}


