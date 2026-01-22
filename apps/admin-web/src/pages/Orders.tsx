// apps/admin-web/src/pages/Orders.tsx
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { getAdminOrders, type AdminOrderRow } from '../api/adminApi';
import './orders.css';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

export default function Orders() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const qParam = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status') ?? 'ALL';

  const [q, setQ] = useState(qParam);
  const [status, setStatus] = useState(statusParam);

  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [items, setItems] = useState<AdminOrderRow[]>([]);

  const rows = useMemo(() => items ?? [], [items]);

  const goOrderDetail = (id: string) => nav(`/app/orders/${id}`);
  const goCustomer = (id?: string | null) => (id ? nav(`/app/customers/${id}`) : null);
  const goSpecialist = (id?: string | null) => (id ? nav(`/app/specialists/${id}`) : null);

  const buildQs = (nextQ: string, nextStatus: string) => {
    const p = new URLSearchParams();
    if (nextQ.trim()) p.set('q', nextQ.trim());
    if (nextStatus !== 'ALL') p.set('status', nextStatus);
    return p;
  };

  const load = async (nextQ = q, nextStatus = status) => {
    setState({ kind: 'loading' });

    try {
      const r = await getAdminOrders({
        q: nextQ.trim() || undefined,
        status: nextStatus !== 'ALL' ? nextStatus : undefined,
      });

      setItems(r.items ?? []);
      setState({ kind: 'ready' });
    } catch {
      setState({ kind: 'error', message: 'No se pudieron cargar las órdenes' });
    }
  };

  const onApplyFilters = async () => {
    // 1) actualizar URL
    const p = buildQs(q, status);
    setSearchParams(p, { replace: true });

    // 2) cargar (sin useEffect → evita tu regla ESLint)
    await load(q, status);
  };

  const onReset = async () => {
    setQ('');
    setStatus('ALL');

    const p = new URLSearchParams();
    setSearchParams(p, { replace: true });

    await load('', 'ALL');
  };

  // Si querés que cargue al entrar a la pantalla automáticamente SIN useEffect:
  // lo hacemos con un botón inicial "Cargar" o con auto-load en primer render.
  // Elegí auto-load “seguro” con guard:
  const [didAutoLoad, setDidAutoLoad] = useState(false);
  if (!didAutoLoad) {
    setDidAutoLoad(true);
    // disparo async sin bloquear render
    void load(qParam, statusParam);
  }

  return (
    <div className="ordersShell">
      <div className="ordersTop">
        <h1 className="ordersTitle">Órdenes</h1>
        <p className="ordersSubtitle">Listado y monitoreo de todas las órdenes</p>
      </div>

      <div className="ordersFilters">
        <input
          className="ordersInput"
          placeholder="Buscar por ID o nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select className="ordersSelect" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="ASSIGNED">Asignada</option>
          <option value="IN_PROGRESS">En curso</option>
          <option value="IN_CLIENT_REVIEW">En revisión</option>
          <option value="CONFIRMED_BY_CLIENT">Confirmada</option>
          <option value="CANCELLED_BY_CUSTOMER">Cancelada (cliente)</option>
          <option value="CANCELLED_BY_SPECIALIST">Cancelada (especialista)</option>
          <option value="CANCELLED_AUTO">Vencida</option>
          <option value="CLOSED">Cerrada</option>
        </select>

        <button className="ordersBtn" onClick={onApplyFilters}>
          Aplicar
        </button>

        <button className="ordersBtn secondary" onClick={onReset}>
          Reset
        </button>

        <div className="ordersCount">{rows.length} resultados</div>
      </div>

      {state.kind === 'loading' && <div className="ordersState">Cargando…</div>}
      {state.kind === 'error' && <div className="ordersState error">{state.message}</div>}

      {state.kind !== 'loading' && state.kind !== 'error' && (
        <div className="ordersTableWrap">
          <table className="ordersTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Especialista</th>
                <th>Servicio</th>
                <th>Estado</th>
                <th>Creada</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>

                  <td>
                    {o.customer?.id ? (
                      <button className="linkBtn" onClick={() => goCustomer(o.customer?.id)}>
                        {o.customer?.name ?? o.customer?.email ?? '—'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td>
                    {o.specialist?.id ? (
                      <button className="linkBtn" onClick={() => goSpecialist(o.specialist?.id)}>
                        {o.specialist?.name ?? o.specialist?.email ?? '—'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td>{o.service?.name ?? '—'}</td>

                  <td>
                    <span className={`statusPill status-${String(o.status)}`}>{o.status}</span>
                  </td>

                  <td>
                    {new Date(o.createdAt).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </td>

                  <td>
                    <button className="rowBtn" onClick={() => goOrderDetail(o.id)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!rows.length && <div className="ordersEmpty">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}


