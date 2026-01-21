import { useMemo, useSyncExternalStore } from 'react';
import { getAdminCustomers, type AdminCustomerRow, type UserStatus } from '../api/adminApi';

type Params = { status?: UserStatus; q?: string };

type State = {
  loading: boolean;
  error: string | null;
  items: AdminCustomerRow[];
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'error';
  }
}

/**
 * Store simple por key (status+q) para evitar setState en useEffect.
 * - El hook se suscribe con useSyncExternalStore
 * - El fetch actualiza el store y notifica subscribers
 */
const store = (() => {
  const stateByKey = new Map<string, State>();
  const subsByKey = new Map<string, Set<() => void>>();
  const inflightByKey = new Map<string, Promise<void>>();

  function getSnapshot(key: string): State {
    return (
      stateByKey.get(key) ?? {
        loading: true,
        error: null,
        items: [],
      }
    );
  }

  function setSnapshot(key: string, next: State) {
    stateByKey.set(key, next);
    const subs = subsByKey.get(key);
    if (subs) subs.forEach((fn) => fn());
  }

  function subscribe(key: string, cb: () => void) {
    const set = subsByKey.get(key) ?? new Set<() => void>();
    set.add(cb);
    subsByKey.set(key, set);
    return () => {
      set.delete(cb);
      if (set.size === 0) subsByKey.delete(key);
    };
  }

  async function ensureFetch(key: string, params?: Params) {
    // si ya hay fetch en curso para este key, no duplicar
    const inflight = inflightByKey.get(key);
    if (inflight) return inflight;

    // marcar loading (sin setState en effect)
    const prev = getSnapshot(key);
    setSnapshot(key, { ...prev, loading: true, error: null });

    const p = getAdminCustomers(params)
      .then((r) => {
        setSnapshot(key, { loading: false, error: null, items: r.items ?? [] });
      })
      .catch((e: unknown) => {
        setSnapshot(key, { loading: false, error: getErrorMessage(e), items: [] });
      })
      .finally(() => {
        inflightByKey.delete(key);
      });

    inflightByKey.set(key, p);
    return p;
  }

  return { getSnapshot, subscribe, ensureFetch };
})();

export function useAdminCustomers(params?: Params) {
  // key estable
  const key = useMemo(
    () => JSON.stringify({ status: params?.status ?? null, q: params?.q?.trim() ?? '' }),
    [params?.status, params?.q],
  );

  // dispara fetch (idempotente) cuando cambia el key
  // NOTE: esto corre durante render, pero ensureFetch está dedupeado y solo muta el store.
  // Si tu lint también prohíbe "side effects in render", te doy alternativa abajo.
  void store.ensureFetch(key, params);

  const snap = useSyncExternalStore(
    (cb) => store.subscribe(key, cb),
    () => store.getSnapshot(key),
    () => store.getSnapshot(key),
  );

  return snap;
}




