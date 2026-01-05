import { useCallback, useEffect, useState } from "react";
import {
  getAdminSpecialistDetail,
  type AdminSpecialistDetail,
} from "../api/adminApi";

export function useAdminSpecialistDetail(id?: string) {
  const [data, setData] = useState<AdminSpecialistDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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




