// apps/admin-web/src/pages/OrderDetail.tsx
import { useState } from 'react';
import { useLoaderData, useNavigate, useParams } from 'react-router-dom';

import { getAdminOrderDetail } from '../api/adminApi';
import './orderDetail.css';

function formatDateAR(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* =======================
   Tipos alineados BACKEND
   ======================= */

type AdminOrderService = {
  id: string;
  name: string;
};

type AdminOrderServiceCategory = {
  id: string;
  name: string;
  slug: string;
};

type AdminOrderUser = {
  userId?: string | null;
  customerId?: string | null;
  specialistId?: string | null;
  email?: string | null;
  name?: string | null;
};

type AdminOrderDetail = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;

  description?: string | null;

  isUrgent: boolean;
  preferredAt: string | null;
  scheduledAt: string | null;

  service: AdminOrderService | null;
  serviceCategory?: AdminOrderServiceCategory | null;

  customer: AdminOrderUser | null;
  specialist: AdminOrderUser | null;

  chatThreadId?: string | null;
  attachments?: unknown[]; // backend puede devolverlo, no lo mostramos por ahora
};

type LoadState =
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  // ✅ viene del loader del router (getAdminOrderDetail)
  const loaded = useLoaderData() as { ok: true; order: AdminOrderDetail };

  const [order, setOrder] = useState<AdminOrderDetail | null>(loaded?.order ?? null);
  const [state, setState] = useState<LoadState>({ kind: 'ready' } as LoadState);

  // ✅ refresh por evento (no useEffect => no dispara regla eslint)
  const refresh = async () => {
    if (!id) {
      setState({ kind: 'error', message: 'Falta ID en la URL' });
      return;
    }

    setState({ kind: 'loading' });
    try {
      const r = await getAdminOrderDetail(id);
      setOrder((r.order ?? null) as AdminOrderDetail | null);
      setState({ kind: 'ready' });
    } catch {
      setState({ kind: 'error', message: 'No se pudo cargar la orden' });
    }
  };

  if (!id) return <div className="odState odError">Falta ID en la URL</div>;
  if (state.kind === 'loading') return <div className="odState">Cargando…</div>;
  if (state.kind === 'error') return <div className="odState odError">{state.message}</div>;
  if (!order) return <div className="odState odError">Sin datos</div>;

  // ✅ IDs correctos (profiles, NO users)
  const customerId = order.customer?.customerId ?? null;
  const specialistId = order.specialist?.specialistId ?? null;
  const isLoading = (state as LoadState).kind === 'loading';

  return (
    <div className="odShell">
      <div className="odTop">
        <button className="odBack" onClick={() => nav(-1)}>
          ← Volver a órdenes
        </button>

        <div>
          <h1 className="odTitle">Detalle de orden</h1>
          <p className="odSubtitle">Vista admin (resumen + datos completos)</p>
        </div>

        <button className="odBtn" onClick={refresh} disabled={!id || isLoading}>
  Refrescar
</button>

      </div>

      <div className="odCard">
        {/* ===== Header ===== */}
        <div className="odRow">
          <div>
            <div className="odLabel">Orden</div>
            <div className="odValue mono" title={order.id}>
              <strong>{order.id}</strong>
            </div>
          </div>

          <div>
            <div className="odLabel">Estado</div>
            <div className="odValue">
              <span className={`pill status-${order.status}`}>{order.status}</span>
            </div>
          </div>

          <div>
            <div className="odLabel">Creada</div>
            <div className="odValue">{formatDateAR(order.createdAt)}</div>
          </div>
        </div>

        <hr className="odHr" />

        {/* ===== Servicio ===== */}
        <div className="odRow">
          <div>
            <div className="odLabel">Servicio</div>
            <div className="odValue">{order.service?.name ?? '—'}</div>
            <div className="odMuted">{order.serviceCategory?.name ?? '—'}</div>
          </div>

          <div>
            <div className="odLabel">Horario</div>
            <div className="odValue">
              {order.isUrgent
                ? '⚡ Lo antes posible'
                : order.scheduledAt
                ? formatDateAR(order.scheduledAt)
                : order.preferredAt
                ? formatDateAR(order.preferredAt)
                : 'Sin definir'}
            </div>
          </div>
        </div>

        <hr className="odHr" />

        {/* ===== Usuarios ===== */}
        <div className="odRow">
          <div>
            <div className="odLabel">Cliente</div>
            <div className="odValue">{order.customer?.name ?? '—'}</div>
            <div className="odMuted">{order.customer?.email ?? '—'}</div>

            <button
              className="rowBtn"
              disabled={!customerId}
              onClick={() => customerId && nav(`/app/customers/${customerId}`)}
            >
              Ver cliente
            </button>
          </div>

          <div>
            <div className="odLabel">Especialista</div>
            <div className="odValue">{order.specialist?.name ?? '— (sin asignar)'}</div>
            <div className="odMuted">{order.specialist?.email ?? '—'}</div>

            <button
              className="rowBtn"
              disabled={!specialistId}
              onClick={() => specialistId && nav(`/app/specialists/${specialistId}`)}
            >
              Ver especialista
            </button>
          </div>
        </div>

        {/* ===== Descripción ===== */}
        {order.description ? (
          <>
            <hr className="odHr" />
            <div>
              <div className="odLabel">Descripción</div>
              <div className="odValue">{order.description}</div>
            </div>
          </>
        ) : null}

        {/* ===== Chat ===== */}
        {order.chatThreadId ? (
          <>
            <hr className="odHr" />
            <div>
              <div className="odLabel">Chat</div>
              <div className="odValue mono">{order.chatThreadId}</div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
