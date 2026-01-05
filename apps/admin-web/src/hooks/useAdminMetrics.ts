// apps/admin-web/src/hooks/useAdminMetrics.ts
import { useCallback, useEffect, useState } from 'react';
import { getAdminMetrics, type AdminMetrics } from '../api/adminApi';

export function useAdminMetrics() {
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getAdminMetrics();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

