// apps/admin-web/src/pages/OrderDetail.tsx
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

type AdminOrderServiceLite = {
  id: string;
  name: string;
  categoryName?: string | null;
  categorySlug?: string | null;
};

type AdminOrderUserLite = {
  id: string; // puede ser customerId / specialistId
  userId?: string | null; // a veces viene, a veces no
  email?: string | null;
  name?: string | null;
};

type AdminOrderEvent = {
  id: string;
  type: string;
  createdAt: string;
  payload?: unknown;
};

type AdminOrderRating = {
  score: number;
  comment: string | null;
};

type AdminOrderDetail = {
  id: string;
  status: string;
  createdAt: string;

  description?: string | null;

  isUrgent: boolean;
  preferredAt: string | null;
  scheduledAt: string | null;

  service: AdminOrderServiceLite | null;
  customer: AdminOrderUserLite | null;
  specialist: AdminOrderUserLite | null;

  events?: AdminOrderEvent[];
  rating?: AdminOrderRating | null;
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
      // r.order viene del backend; lo tipamos como AdminOrderDetail
      setOrder((r.order ?? null) as AdminOrderDetail | null);
      setState({ kind: 'ready' });
    } catch {
      setState({ kind: 'error', message: 'No se pudo cargar la orden' });
    }
  };

  // Auto-load sin useEffect (evita la regla react-hooks/set-state-in-effect)
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

  const customerUserId = order.customer?.userId ?? order.customer?.id ?? null;
  const specialistId = order.specialist?.id ?? order.specialist?.userId ?? null;

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
        <div className="odRow">
          <div>
            <div className="odLabel">Orden</div>
            <div className="odValue">
              <strong>{order.id}</strong>
            </div>
          </div>

          <div>
            <div className="odLabel">Estado</div>
            <div className="odValue">
              <span className="pill">{order.status}</span>
            </div>
          </div>

          <div>
            <div className="odLabel">Creada</div>
            <div className="odValue">{formatDateAR(order.createdAt)}</div>
          </div>
        </div>

        <hr className="odHr" />

        <div className="odRow">
          <div>
            <div className="odLabel">Servicio</div>
            <div className="odValue">{order.service?.name ?? '—'}</div>
            <div className="odMuted">{order.service?.categoryName ?? '—'}</div>
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

        <div className="odRow">
          <div>
            <div className="odLabel">Cliente</div>
            <div className="odValue">{order.customer?.name ?? '—'}</div>
            <div className="odMuted">{order.customer?.email ?? '—'}</div>

            <button
              className="rowBtn"
              disabled={!customerUserId}
              onClick={() => customerUserId && nav(`/app/customers/${customerUserId}`)}
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

        {order.description ? (
          <>
            <hr className="odHr" />
            <div>
              <div className="odLabel">Descripción</div>
              <div className="odValue">{order.description}</div>
            </div>
          </>
        ) : null}

        {Array.isArray(order.events) && order.events.length ? (
          <>
            <hr className="odHr" />
            <div>
              <div className="odLabel">Eventos</div>
              <div className="odList">
                {order.events.map((e) => (
                  <div key={e.id} className="odListItem">
                    <strong>{e.type}</strong>
                    <span className="odMuted">{formatDateAR(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {order.rating ? (
          <>
            <hr className="odHr" />
            <div>
              <div className="odLabel">Rating</div>
              <div className="odValue">⭐ {order.rating.score}/5</div>
              <div className="odMuted">{order.rating.comment ?? 'Sin comentario'}</div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
