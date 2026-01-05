// apps/admin-web/src/pages/Dashboard.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminMetrics } from '../hooks/useAdminMetrics';
import './dashboard.css';

function MetricCard(props: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  onClick?: () => void;
}) {
  const tone = props.tone ?? 'neutral';
  const clickable = Boolean(props.onClick);

  return (
    <div
      className={`cardMetric tone-${tone} ${clickable ? 'isClickable' : ''}`}
      onClick={props.onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (!props.onClick) return;
        if (e.key === 'Enter' || e.key === ' ') props.onClick();
      }}
    >
      <div className="metricTop">
        <div className="metricLabel">{props.label}</div>
        <div className="metricValue">{props.value}</div>
      </div>
      {props.hint ? <div className="metricHint">{props.hint}</div> : <div className="metricHint" />}
    </div>
  );
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="sectionHead">
        <div>
          <h2 className="sectionTitle">{props.title}</h2>
          {props.subtitle ? <p className="sectionSubtitle">{props.subtitle}</p> : null}
        </div>
      </div>
      <div className="cardsGrid">{props.children}</div>
    </section>
  );
}

export default function Dashboard() {
  const { data, loading, error, reload } = useAdminMetrics();
  const navigate = useNavigate();

  return (
    <div className="dashboardShell">
      <div className="dashboardTop">
        <div>
          <h1 className="dashboardTitle">Panel de administración</h1>
          <p className="dashboardSubtitle">Resumen del sistema (usuarios, órdenes y especialistas)</p>
        </div>

        <button className="refreshBtn" onClick={reload} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="stateBox stateError">
          <strong>Error:</strong> {error}
        </div>
      )}

      {!error && !data && (
        <div className="stateBox">{loading ? 'Cargando métricas…' : 'Sin datos'}</div>
      )}

      {data && (
        <div className="sections">
          {/* 👤 Usuarios */}
          <Section title="Usuarios" subtitle="Conteos generales">
            <MetricCard label="Usuarios totales" value={data.users.total} tone="neutral" />
            <MetricCard label="Clientes" value={data.users.customers} tone="good" />

            <MetricCard
              label="Especialistas"
              value={data.users.specialists}
              tone="neutral"
              hint="Ver listado"
              onClick={() => navigate('/app/specialists')}
            />

            <MetricCard label="Administradores" value={data.users.admins} tone="neutral" />
          </Section>

          {/* 🧾 Órdenes */}
          <Section title="Órdenes" subtitle="Estado del flujo operativo">
            <MetricCard label="Órdenes totales" value={data.orders.total} tone="neutral" />
            <MetricCard label="Pendientes" value={data.orders.pending} hint="Sin asignar" tone="warn" />
            <MetricCard
              label="En curso"
              value={data.orders.active}
              hint="Asignadas / en progreso"
              tone="neutral"
            />
            <MetricCard
              label="Finalizadas"
              value={data.orders.finished}
              hint="Confirmadas / cerradas"
              tone="good"
            />
            <MetricCard
              label="Canceladas"
              value={data.orders.cancelled}
              hint="Cancelación / rechazo"
              tone="bad"
            />
          </Section>

          {/* 👷 Especialistas */}
          <Section title="Especialistas" subtitle="KYC y suscripciones (resumen)">
            <MetricCard
              label="Especialistas totales"
              value={data.specialists.total}
              tone="neutral"
              hint="Ver listado"
              onClick={() => navigate('/app/specialists')}
            />

            <MetricCard
              label="KYC pendientes"
              value={data.specialists.kycPending}
              hint="Revisión requerida"
              tone={data.specialists.kycPending > 0 ? 'warn' : 'good'}
              onClick={() => navigate('/app/specialists?kyc=PENDING')}
            />

            <MetricCard
              label="Suscripción activa"
              value={data.specialists.subscriptions.ACTIVE}
              tone="good"
              hint="Filtrar"
              onClick={() => navigate('/app/specialists?sub=ACTIVE')}
            />

            <MetricCard
              label="En prueba"
              value={data.specialists.subscriptions.TRIALING}
              hint="Trial"
              tone="neutral"
              onClick={() => navigate('/app/specialists?sub=TRIALING')}
            />

            <MetricCard
              label="Pago atrasado"
              value={data.specialists.subscriptions.PAST_DUE}
              hint="Past due"
              tone={data.specialists.subscriptions.PAST_DUE > 0 ? 'warn' : 'neutral'}
              onClick={() => navigate('/app/specialists?sub=PAST_DUE')}
            />

            <MetricCard
              label="Canceladas"
              value={data.specialists.subscriptions.CANCELLED}
              hint="Baja"
              tone={data.specialists.subscriptions.CANCELLED > 0 ? 'bad' : 'neutral'}
              onClick={() => navigate('/app/specialists?sub=CANCELLED')}
            />
          </Section>
        </div>
      )}
    </div>
  );
}





