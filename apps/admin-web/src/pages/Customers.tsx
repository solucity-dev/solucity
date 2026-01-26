//apps/admin-web/src/pages/Customer.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  deleteAdminUser,
  setAdminCustomerStatus,
  type AdminCustomerRow,
  type UserStatus,
} from '../api/adminApi';
import { useAdminCustomers } from '../hooks/useAdminCustomers';
import './customers.css';

type StatusFilter = 'ALL' | UserStatus;

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="pill">{children}</span>;
}

function normalizeStatus(v: string | null): StatusFilter {
  const x = (v ?? '').toUpperCase();
  if (x === 'ACTIVE' || x === 'BLOCKED') return x;
  return 'ALL';
}

export default function Customers() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQ = searchParams.get('q') ?? '';
  const initialStatus = normalizeStatus(searchParams.get('status'));

  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);

  const { items, loading, error, reload } = useAdminCustomers({
  q,
  status: status === 'ALL' ? undefined : status,
});

  // acciones por fila
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);

  useEffect(() => {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (status !== 'ALL') params.set('status', status);

  const next = params.toString();
  const curr = searchParams.toString();
  if (next !== curr) setSearchParams(params, { replace: true });
}, [q, status, searchParams, setSearchParams]);


  const rows = useMemo<AdminCustomerRow[]>(() => {
    const query = q.trim().toLowerCase();
    return items.filter((r) => {
      if (!query) return true;
      return (
        r.email.toLowerCase().includes(query) ||
        (r.name ?? '').toLowerCase().includes(query) ||
        r.userId.toLowerCase().includes(query)
      );
    });
  }, [items, q]);

  async function toggleStatus(r: AdminCustomerRow) {
    const next: UserStatus = r.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    const ok = window.confirm(`¿Cambiar estado a ${next}?`);
    if (!ok) return;

    setRowActionId(r.userId);
    setRowMsg(null);

    try {
  await setAdminCustomerStatus(r.userId, next);
  await reload(); // ✅ refresca lista desde backend
  setRowMsg(`Estado actualizado a ${next}`);
} catch {
  setRowMsg('Error al cambiar estado');
} finally {
  setRowActionId(null);
}
  }

  async function freeEmail(r: AdminCustomerRow) {
    const ok = window.confirm(
      `¿Liberar email?\n${r.email}\n\nEsto bloquea el usuario y libera el email.`,
    );
    if (!ok) return;

    setRowActionId(r.userId);
    setRowMsg(null);

try {
  await deleteAdminUser(r.userId, 'anonymize');
  await reload(); // ✅ refresca lista para ver email nuevo + status bloqueado
  setRowMsg('Email liberado correctamente');
} catch {
  setRowMsg('Error al liberar email');
} finally {
  setRowActionId(null);
}

  }

  const goDetail = (r: AdminCustomerRow) => {
  // ✅ el detalle admin usa CustomerProfile.id (no User.id)
  const id = (r as unknown as { customerId?: string | null }).customerId ?? r.userId;
  nav(`/app/customers/${id}`);
};

  return (
    <div className="custShell">
      <div className="custTop">
        <div>
          <h1 className="custTitle">Clientes</h1>
          <p className="custSubtitle">Listado y gestión</p>
        </div>
      </div>

      {error && <div className="custState">Error: {error}</div>}
      {rowMsg && <div className="custState">{rowMsg}</div>}

      <div className="custFilters">
        <input
          className="custInput"
          placeholder="Buscar por nombre, email o ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="custSelect"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="ALL">Estado: Todos</option>
          <option value="ACTIVE">Activo</option>
          <option value="BLOCKED">Bloqueado</option>
        </select>

        <div className="custCount">{rows.length} resultados</div>
      </div>

      <div className="custTableWrap">
        <table className="custTable">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>
                  <strong>{r.name ?? '—'}</strong>
                  <div className="muted">{r.email}</div>
                  <div className="muted">ID: {r.userId}</div>
                </td>

                <td>
                  <Pill>{r.status}</Pill>
                </td>

                <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="rowBtn" onClick={() => goDetail(r)}>
                    Ver
                  </button>

                  <button
                    className="rowBtn"
                    onClick={() => toggleStatus(r)}
                    disabled={rowActionId === r.userId}
                  >
                    {r.status === 'ACTIVE' ? 'Bloquear' : 'Activar'}
                  </button>

                  <button
                    className="rowBtn"
                    onClick={() => freeEmail(r)}
                    disabled={rowActionId === r.userId}
                    style={{ background: '#ffe6e6', color: '#8b0000' }}
                  >
                    Liberar email
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && !rows.length && <div className="custEmpty">Sin resultados</div>}
        {loading && <div className="custEmpty">Cargando…</div>}
      </div>
    </div>
  );
}
