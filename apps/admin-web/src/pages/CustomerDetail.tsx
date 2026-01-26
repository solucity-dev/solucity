//apps/admin-web/serc/pages/CustomerDetail.tsx
import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  deleteAdminUser,
  getAdminCustomerDetail,
  setAdminCustomerStatus,
  type AdminCustomerDetail,
  type UserStatus,
} from '../api/adminApi';

import './customerDetail.css';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cdCard">
      <div className="cdCardHead">
        <h3 className="cdCardTitle">{title}</h3>
      </div>
      <div className="cdCardBody">{children}</div>
    </section>
  );
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

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    getAdminCustomerDetail(id)
      .then(setData)
      .catch(() => setError('No se pudo cargar el cliente'))
      .finally(() => setLoading(false));
  }, [id]);

  const initials = useMemo(() => {
    const n = data?.name?.trim() || '';
    if (!n) return 'CL';
    return n
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }, [data?.name]);

  async function toggleStatus() {
    if (!data) return;

    const next: UserStatus = data.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';

    setActionLoading(true);
    setOkMsg(null);
    setErrMsg(null);

    try {
      await setAdminCustomerStatus(data.userId, next);
      setData({ ...data, status: next });
      setOkMsg(`Estado actualizado a ${next}`);
    } catch {
      setErrMsg('No se pudo cambiar el estado');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFreeEmail() {
    if (!data?.userId || !data.email) return;

    const ok = window.confirm(
      `¿Liberar el email "${data.email}"?\n\nEsto anonimizá el usuario y permite volver a registrarlo.`,
    );
    if (!ok) return;

    setActionLoading(true);
    setOkMsg(null);
    setErrMsg(null);

    try {
      const r = await deleteAdminUser(data.userId, 'anonymize');
if (!r.ok) throw new Error();

// reflejar en UI
setData({ ...data, email: r.newEmail ?? data.email, status: 'BLOCKED' });
setOkMsg(`Email liberado correctamente → ${r.newEmail ?? 'deleted+...@deleted.local'}`);

    } catch {
      setErrMsg('No se pudo liberar el email');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="cdShell">
      <div className="cdTop">
        <div>
          <Link to="/app/customers" className="cdBack">
            ← Volver a clientes
          </Link>

          <h1 className="cdTitle">Detalle del cliente</h1>
          <p className="cdSubtitle">Información general y acciones</p>
        </div>
      </div>

      {!id && <div className="cdState cdError">Falta ID en la URL</div>}
      {error && <div className="cdState cdError">{error}</div>}
      {loading && <div className="cdState">Cargando…</div>}

      {data && (
        <>
          <div className="cdHero">
            <div className="cdAvatar">{initials}</div>

            <div className="cdHeroMain">
              <div className="cdName">{data.name ?? '—'}</div>
              <div className="cdMeta">
                <div>
                  <span>Email</span>
                  <strong>{data.email}</strong>
                </div>
                <div>
                  <span>Estado</span>
                  <strong>{data.status}</strong>
                </div>
                <div>
                  <span>Creado</span>
                  <strong>{formatDateAR(data.createdAt)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="cdGrid">
            <Card title="Acciones">
              <div className="cdActions">
                <button className="cdBtn" onClick={toggleStatus} disabled={actionLoading}>
                  {data.status === 'ACTIVE' ? '🚫 Bloquear' : '✅ Activar'}
                </button>

                <button
                  className="cdBtn danger"
                  onClick={handleFreeEmail}
                  disabled={actionLoading}
                >
                  🧹 Liberar email
                </button>
              </div>

              {okMsg && <div className="cdState">{okMsg}</div>}
              {errMsg && <div className="cdState cdError">{errMsg}</div>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
