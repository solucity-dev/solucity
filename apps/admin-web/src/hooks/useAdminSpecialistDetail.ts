// apps/admin-web/hooks/useAdminSpecialistDetail.tsx
import { useCallback, useEffect, useState } from "react";
import {
  getAdminSpecialistDetail,
  type AdminSpecialistDetail,
} from "../api/adminApi";

export function useAdminSpecialistDetail(id?: string) {
  const [data, setData] = useState<AdminSpecialistDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ CAMBIO 2: limpiar estado si no hay id
  useEffect(() => {
    if (!id) {
      setData(null);
      setError(null);
    }
  }, [id]);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminSpecialistDetail(id);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}





