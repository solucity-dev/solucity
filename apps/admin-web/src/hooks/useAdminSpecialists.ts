// apps/admin-web/src/hooks/useAdminSpecialists.ts
import { useCallback, useEffect, useState } from 'react';
import { getAdminSpecialists, type AdminSpecialistRow } from '../api/adminApi';

export function useAdminSpecialists() {
  const [data, setData] = useState<AdminSpecialistRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminSpecialists();
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
