// apps/mobile/src/hooks/useChatThreads.ts
import { useQuery } from '@tanstack/react-query';

import type { ChatThreadListItem } from '@/types/chat';

import { getMyChatThreads } from '@/api/chat';

export function useChatThreads() {
  const query = useQuery<ChatThreadListItem[]>({
    queryKey: ['chat', 'threads'],
    queryFn: async () => {
      try {
        const data = await getMyChatThreads();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    staleTime: 15_000,

    // ✅ polling suave (mejora UX web + mobile)
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  return {
    ...query,
    threads: query.data ?? [],
  };
}
