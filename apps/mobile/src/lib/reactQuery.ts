//mobile/src/lib/reactQuery.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s “fresca”
      retry: 1, // reintentos suaves
      refetchOnReconnect: true,
      refetchOnMount: false,
      refetchOnWindowFocus: true, // en RN lo mapeamos a AppState (abajo)
    },
    mutations: {
      retry: 0,
    },
  },
});
