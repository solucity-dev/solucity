import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getAdminBackgroundChecksList,
  type AdminBackgroundCheckRowList,
  type AdminBackgroundChecksListResp,
} from '../api/adminApi';

function formatDateAR(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizeStatus(s: string) {
  return (s || 'PENDING').toUpperCase().trim();
}

export default function BackgroundChecksPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const status = normalizeStatus(sp.get('status') ?? 'PENDING');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<AdminBackgroundChecksListResp | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const r = await getAdminBackgroundChecksList({ status });
      setResp(r);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'Error al cargar antecedentes';
      setError(msg);
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const items = useMemo<AdminBackgroundCheckRowList[]>(() => {
    const arr = resp?.items ?? [];
    if (status === 'ALL') return arr;
    return arr.filter((x) => normalizeStatus(x.status) === status);
  }, [resp, status]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Antecedentes penales</h1>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Filtro status: <b>{status}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/app/background-checks?status=PENDING')}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}
          >
            Pendientes
          </button>
          <button
            onClick={() => navigate('/app/background-checks?status=ALL')}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}
          >
            Todas (debug)
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(255,0,0,0.08)',
            border: '1px solid rgba(255,0,0,0.2)',
          }}
        >
          <b>Error:</b> {error}
        </div>
      )}

      {!error && !resp && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)' }}>
          {loading ? 'Cargando…' : 'Sin datos'}
        </div>
      )}

      {resp && (
        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 10, opacity: 0.8 }}>
            Total backend: <b>{resp.count}</b> — Mostrando: <b>{items.length}</b>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)' }}>
              No hay antecedentes para este filtro.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((b) => {
                const specialistId = b.specialist?.specialistId ?? null;
                const name = b.specialist?.name ?? '—';
                const email = b.specialist?.email ?? '—';
                const createdAt = formatDateAR(b.createdAt);
                const fileUrl = b.fileUrl;

                const statusTone =
                  normalizeStatus(b.status) === 'PENDING'
                    ? 'rgba(255,165,0,0.18)'
                    : normalizeStatus(b.status) === 'APPROVED'
                      ? 'rgba(0,200,0,0.14)'
                      : 'rgba(255,0,0,0.12)';

                return (
                  <div
                    key={b.id}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: '1px solid rgba(0,0,0,0.12)',
                      background: 'rgba(255,255,255,0.75)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: statusTone,
                              border: '1px solid rgba(0,0,0,0.10)',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {normalizeStatus(b.status)}
                          </span>

                          <span style={{ opacity: 0.7, fontSize: 13 }}>Subido: {createdAt}</span>
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontWeight: 700 }}>{name}</div>
                          <div style={{ opacity: 0.75, fontSize: 13 }}>{email}</div>
                        </div>

                        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {fileUrl ? (
                            <a href={fileUrl} target="_blank" rel="noreferrer">
                              Ver archivo
                            </a>
                          ) : (
                            <span style={{ opacity: 0.6 }}>Sin archivo</span>
                          )}

                          <span style={{ opacity: 0.6, fontSize: 12 }}>ID: {b.id}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {specialistId ? (
                          <Link
                            to={`/app/specialists/${encodeURIComponent(specialistId)}`}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 12,
                              border: '1px solid rgba(0,0,0,0.14)',
                              textDecoration: 'none',
                              fontWeight: 700,
                            }}
                          >
                            Ver especialista →
                          </Link>
                        ) : (
                          <span style={{ opacity: 0.6 }}>Sin specialistId</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
