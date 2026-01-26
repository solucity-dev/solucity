// apps/admin-web/src/pages/Specialists.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteAdminUser, type AdminSpecialistRow } from '../api/adminApi';
import { useAdminSpecialists } from '../hooks/useAdminSpecialists';
import './specialists.css';

type KycFilter = 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';
type SubFilter = 'ALL' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'NONE';
type SpecialtyFilter = 'ALL' | string;

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="pill">{children}</span>;
}

function normalizeKyc(v: string | null): KycFilter {
  const x = (v ?? '').toUpperCase();
  if (x === 'PENDING' || x === 'VERIFIED' || x === 'REJECTED' || x === 'UNVERIFIED') return x;
  return 'ALL';
}

function normalizeSub(v: string | null): SubFilter {
  const x = (v ?? '').toUpperCase();
  if (x === 'TRIALING' || x === 'ACTIVE' || x === 'PAST_DUE' || x === 'CANCELLED' || x === 'NONE')
    return x;
  return 'ALL';
}

function normalizeCat(v: string | null): SpecialtyFilter {
  const x = (v ?? '').trim();
  return x || 'ALL';
}

function formatDateAR(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function Specialists() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useAdminSpecialists();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQ = searchParams.get('q') ?? '';
  const initialKyc = normalizeKyc(searchParams.get('kyc'));
  const initialSub = normalizeSub(searchParams.get('sub'));
  const initialCat = normalizeCat(searchParams.get('cat'));

  const [q, setQ] = useState(initialQ);
  const [filterKyc, setFilterKyc] = useState<KycFilter>(initialKyc);
  const [filterSub, setFilterSub] = useState<SubFilter>(initialSub);
  const [filterCat, setFilterCat] = useState<SpecialtyFilter>(initialCat);

  // ✅ acción por fila
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowOk, setRowOk] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);

  useEffect(() => {
    const nextQ = searchParams.get('q') ?? '';
    const nextKyc = normalizeKyc(searchParams.get('kyc'));
    const nextSub = normalizeSub(searchParams.get('sub'));
    const nextCat = normalizeCat(searchParams.get('cat'));

    if (nextQ !== q) setQ(nextQ);
    if (nextKyc !== filterKyc) setFilterKyc(nextKyc);
    if (nextSub !== filterSub) setFilterSub(nextSub);
    if (nextCat !== filterCat) setFilterCat(nextCat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
  const params = new URLSearchParams();
  const trimmed = q.trim();

  if (trimmed) params.set('q', trimmed);
  if (filterKyc !== 'ALL') params.set('kyc', filterKyc);
  if (filterSub !== 'ALL') params.set('sub', filterSub);
  if (filterCat !== 'ALL') params.set('cat', filterCat);

  // ✅ evita ping-pong (solo escribimos si cambia realmente)
  const next = params.toString();
  const current = searchParams.toString();
  if (next === current) return;

  setSearchParams(params, { replace: true });
}, [q, filterKyc, filterSub, filterCat, searchParams, setSearchParams]);

  const specialtyOptions = useMemo(() => {
    const list: AdminSpecialistRow[] = data ?? [];
    const map = new Map<string, string>();

    for (const r of list) {
      for (const s of r.specialties ?? []) {
        if (!map.has(s.slug)) map.set(s.slug, s.name);
      }
    }

    return Array.from(map.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [data]);

  const rows = useMemo<AdminSpecialistRow[]>(() => {
    const list: AdminSpecialistRow[] = data ?? [];
    const query = q.trim().toLowerCase();

    return list
      .filter((r) => {
        if (!query) return true;
        return (
          r.email.toLowerCase().includes(query) ||
          r.name.toLowerCase().includes(query) ||
          r.userId.toLowerCase().includes(query) ||
          (r.specialistId ?? '').toLowerCase().includes(query)
        );
      })
      .filter((r) => (filterKyc === 'ALL' ? true : r.kycStatus === filterKyc))
      .filter((r) => {
        if (filterSub === 'ALL') return true;
        if (filterSub === 'NONE') return !r.subscription;
        return r.subscription?.status === filterSub;
      })
      .filter((r) => (filterCat === 'ALL' ? true : (r.specialtySlugs ?? []).includes(filterCat)));
  }, [data, q, filterKyc, filterSub, filterCat]);

  const summary = useMemo(() => {
    const list: AdminSpecialistRow[] = data ?? [];
    return {
      total: list.length,
      kycPending: list.filter((x) => x.kycStatus === 'PENDING').length,
      active: list.filter((x) => x.subscription?.status === 'ACTIVE').length,
      trial: list.filter((x) => x.subscription?.status === 'TRIALING').length,
      pastDue: list.filter((x) => x.subscription?.status === 'PAST_DUE').length,
    };
  }, [data]);

  const goDetail = (r: AdminSpecialistRow) => {
    const id = r.specialistId ?? r.userId;
    nav(`/app/specialists/${id}`);
  };

  async function handleFreeEmailRow(r: AdminSpecialistRow) {
    if (!r.userId || !r.email) return;

    const ok = window.confirm(
      `¿Liberar email para:\n${r.name}\n${r.email}\n\nEsto cambia el email a deleted+... y lo bloquea.\n✅ Te permite registrar otra vez con el email original.`,
    );
    if (!ok) return;

    setRowOk(null);
    setRowErr(null);
    setRowActionId(r.userId);

    try {
      const resp = await deleteAdminUser(r.userId, 'anonymize');
      if (!resp.ok) throw new Error('No se pudo liberar el email');
      setRowOk(`✅ Email liberado: ${r.email} → ${resp.newEmail ?? 'deleted+...@deleted.local'}`);
      await reload();
    } catch (e: unknown) {
  const msg =
    e instanceof Error ? e.message : typeof e === 'string' ? e : 'Error al liberar email';
  setRowErr(msg);
}
    finally {
      setRowActionId(null);
    }
  }

  return (
    <div className="specShell">
      <div className="specTop">
        <button
  className="specBack"
  onClick={() => nav('/app', { replace: true })}
>
  ← Dashboard
</button>

        <div>
          <h1 className="specTitle">Especialistas</h1>
          <p className="specSubtitle">Listado, búsqueda y filtros</p>
        </div>

        <button className="specBtn" onClick={reload} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="specState">Error: {error}</div>}
      {!data && !error && <div className="specState">Cargando…</div>}

      {rowOk && <div className="specState">{rowOk}</div>}
      {rowErr && <div className="specState" style={{ color: '#b00020' }}>{rowErr}</div>}

      {data && (
        <>
          <div className="specSummary">
            <div className="sumCard">
              <div className="sumLabel">Total</div>
              <div className="sumValue">{summary.total}</div>
            </div>
            <div className="sumCard">
              <div className="sumLabel">KYC pendientes</div>
              <div className="sumValue">{summary.kycPending}</div>
            </div>
            <div className="sumCard">
              <div className="sumLabel">Activos</div>
              <div className="sumValue">{summary.active}</div>
            </div>
            <div className="sumCard">
              <div className="sumLabel">Trial</div>
              <div className="sumValue">{summary.trial}</div>
            </div>
            <div className="sumCard">
              <div className="sumLabel">Pago atrasado</div>
              <div className="sumValue">{summary.pastDue}</div>
            </div>
          </div>

          <div className="specFilters">
            <input
              className="specInput"
              placeholder="Buscar por nombre, email o ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <select className="specSelect" value={filterKyc} onChange={(e) => setFilterKyc(e.target.value as KycFilter)}>
              <option value="ALL">KYC: Todos</option>
              <option value="PENDING">Pendiente</option>
              <option value="VERIFIED">Verificado</option>
              <option value="REJECTED">Rechazado</option>
              <option value="UNVERIFIED">Sin verificar</option>
            </select>

            <select className="specSelect" value={filterSub} onChange={(e) => setFilterSub(e.target.value as SubFilter)}>
              <option value="ALL">Suscripción: Todas</option>
              <option value="ACTIVE">Activa</option>
              <option value="TRIALING">Trial</option>
              <option value="PAST_DUE">Pago atrasado</option>
              <option value="CANCELLED">Cancelada</option>
              <option value="NONE">Sin suscripción</option>
            </select>

            <select
              className="specSelect"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              disabled={!specialtyOptions.length}
              title={!specialtyOptions.length ? 'No hay rubros en los datos' : ''}
            >
              <option value="ALL">Rubro: Todos</option>
              {specialtyOptions.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="specCount">{rows.length} resultados</div>
          </div>

          <div className="specTableWrap">
            <table className="specTable">
              <thead>
                <tr>
                  <th>Especialista</th>
                  <th>KYC</th>
                  <th>Suscripción</th>
                  <th>Rating</th>
                  <th>Días</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <strong>{r.name}</strong>
                      <div className="muted">{r.email}</div>

                      <div className="muted" style={{ marginTop: 2 }}>
                        <span style={{ opacity: 0.8 }}>ID:</span> {r.specialistId ?? r.userId}
                      </div>

                      <div className="muted" style={{ marginTop: 2 }}>
  <span style={{ opacity: 0.8 }}>Creado:</span> {formatDateAR(r.createdAt)}
</div>


                      {r.specialties?.length ? (
                        <div className="muted" style={{ marginTop: 4 }}>
                          {r.specialties.slice(0, 3).map((x) => x.name).join(' · ')}
                          {r.specialties.length > 3 ? ` · +${r.specialties.length - 3}` : ''}
                        </div>
                      ) : null}
                    </td>

                    <td>
                      <Pill>{r.kycStatus}</Pill>
                    </td>

                    <td>
                      <Pill>{r.subscription?.status ?? 'NONE'}</Pill>
                    </td>

                    <td>
                      {Number.isFinite(r.ratingAvg) ? r.ratingAvg.toFixed(1) : '0.0'} ({r.ratingCount ?? 0})

                    </td>

                    <td>{r.daysLeft ?? '-'}</td>

                    <td>
                      <Pill>{r.status}</Pill>
                    </td>

                    <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="rowBtn" onClick={() => goDetail(r)}>
                        Ver
                      </button>

                      <button
                        className="rowBtn"
                        onClick={() => handleFreeEmailRow(r)}
                        disabled={rowActionId === r.userId}
                        style={{ background: '#ffe6e6', color: '#8b0000' }}
                        title="Libera el email (anonymize) para poder registrarlo de nuevo"
                      >
                        {rowActionId === r.userId ? '...' : 'Liberar email'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!rows.length && <div className="specEmpty">Sin resultados</div>}
          </div>
        </>
      )}
    </div>
  );
}






