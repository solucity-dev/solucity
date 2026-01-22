import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);

  const load = async (orderId: string) => {
    setState({ kind: 'loading' });
    try {
      const r = await getAdminOrderDetail(orderId);
      setOrder((r.order ?? null) as AdminOrderDetail | null);
      setState({ kind: 'ready' });
    } catch {
      setState({ kind: 'error', message: 'No se pudo cargar la orden' });
    }
  };

  // Auto-load sin useEffect
  const [didAutoLoad, setDidAutoLoad] = useState(false);
  if (!didAutoLoad) {
    setDidAutoLoad(true);
    if (id) void load(id);
    else setState({ kind: 'error', message: 'Falta ID en la URL' });
  }

  if (!id) return <div className="odState odError">Falta ID en la URL</div>;
  if (state.kind === 'loading') return <div className="odState">Cargando…</div>;
  if (state.kind === 'error') return <div className="odState odError">{state.message}</div>;
  if (!order) return <div className="odState odError">Sin datos</div>;

  // ✅ IDs correctos (profiles, NO users)
  const customerId = order.customer?.customerId ?? null;
  const specialistId = order.specialist?.specialistId ?? null;

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

        <button className="odBtn" onClick={() => void load(id)}>
          Refrescar
        </button>
      </div>

      <div className="odCard">
        {/* ===== Header ===== */}
        <div className="odRow">
          <div>
            <div className="odLabel">Orden</div>
            <div className="odValue mono">
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

