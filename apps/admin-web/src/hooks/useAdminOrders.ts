//apps/admin-web/src/hooks/useAdminOrders.ts
import React from 'react';
import { getAdminOrders, type AdminOrderRow } from '../api/adminApi';

export function useAdminOrders(params: { q?: string; status?: string }) {
  const q = params.q;
  const status = params.status;

  const [data, setData] = React.useState<AdminOrderRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getAdminOrders({ q, status });
      setData(r.items ?? []);
    } catch {
      setError('No se pudieron cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  React.useEffect(() => {
  void reload();
}, [reload]);

  return { data, loading, error, reload };
}
