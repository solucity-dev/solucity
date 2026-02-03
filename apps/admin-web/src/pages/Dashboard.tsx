// apps/admin-web/src/pages/Dashboard.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminMetrics } from '../hooks/useAdminMetrics';
import './dashboard.css';

// 🔔 Helpers para alarma (sin assets) + notificación del navegador
let alarmInterval: number | null = null;

function playAlarm(durationMs = 30000) {
  try {
    // Si ya hay una alarma sonando, no arrancamos otra
    if (alarmInterval !== null) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const playTone = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 900; // tono alarma
      gain.gain.value = 0.18;    // volumen

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    };

    // 🔔 beep inmediato
    playTone();

    // 🔁 beep cada 1.2 segundos
    alarmInterval = window.setInterval(() => {
      playTone();
    }, 1200);

    // ⛔ cortar alarma después de X tiempo
    window.setTimeout(() => {
      if (alarmInterval) {
        window.clearInterval(alarmInterval);
        alarmInterval = null;
      }
      ctx.close();
    }, durationMs);
  } catch {
    // no-op
  }
}

function notify(title: string, body: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

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

    // Snapshot anterior para detectar incrementos
  const prevRef = React.useRef<{
    usersTotal: number;
    kycPending: number;
    certificationsPending: number;
    backgroundPending: number;
  } | null>(null);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (!loading) reload();
    }, 30000);

    return () => window.clearInterval(id);
  }, [reload, loading]);


  // Pedir permiso de notificaciones (opcional, pero recomendado)
  React.useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Comparar valores y disparar alarma si INCREMENTAN
  React.useEffect(() => {
    if (!data) return;

    const current = {
      usersTotal: Number(data.users?.total || 0),
      kycPending: Number(data.specialists?.kycPending || 0),
      certificationsPending: Number(data.specialists?.certificationsPending || 0),
      backgroundPending: Number(data.specialists?.backgroundPending || 0),
    };

    const prev = prevRef.current;

    if (prev) {
      const alerts: string[] = [];

      if (current.usersTotal > prev.usersTotal) {
        alerts.push(`Usuarios totales: ${prev.usersTotal} → ${current.usersTotal}`);
      }

      if (current.kycPending > prev.kycPending) {
        alerts.push(`KYC pendientes: ${prev.kycPending} → ${current.kycPending}`);
      }

      if (current.certificationsPending > prev.certificationsPending) {
        alerts.push(
          `Matrículas pendientes: ${prev.certificationsPending} → ${current.certificationsPending}`
        );
      }

      if (current.backgroundPending > prev.backgroundPending) {
        alerts.push(
          `Antecedentes pendientes: ${prev.backgroundPending} → ${current.backgroundPending}`
        );
      }

      // Si hubo al menos un incremento, sonar + notificar
if (alerts.length > 0) {
  playAlarm(30000); // 🔔 30 segundos de alarma
  notify('Solucity · Nuevo pendiente / cambio', alerts.join('\n'));
}

    }

    prevRef.current = current;
  }, [data]);

  return (
    <div className="dashboardShell">
      <div className="dashboardTop">
        <div>
          <h1 className="dashboardTitle">Panel de administración</h1>
          <p className="dashboardSubtitle">Resumen del sistema (usuarios, órdenes y especialistas)</p>
        </div>

        <button
  className="refreshBtn"
  onClick={() => {
    if (alarmInterval) {
      window.clearInterval(alarmInterval);
      alarmInterval = null;
    }
    reload();
  }}
  disabled={loading}
>

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
            <MetricCard
              label="Clientes"
              value={data.users.customers}
              tone="good"
              hint="Ver listado"
              onClick={() => navigate('/app/customers')}
            />

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
  <MetricCard
    label="Órdenes totales"
    value={data.orders.total}
    tone="neutral"
    hint="Ver todas"
    onClick={() => navigate('/app/orders')}
  />

  <MetricCard
    label="Pendientes"
    value={data.orders.pending}
    hint="Sin asignar"
    tone="warn"
    onClick={() => navigate('/app/orders?status=PENDING')}
  />

  <MetricCard
    label="En curso"
    value={data.orders.active}
    hint="Asignadas / en progreso"
    tone="neutral"
    onClick={() => navigate('/app/orders?group=ACTIVE')}

  />

  <MetricCard
    label="Finalizadas"
    value={data.orders.finished}
    hint="Confirmadas / cerradas"
    tone="good"
    onClick={() => navigate('/app/orders?group=FINISHED')}
  />

  <MetricCard
    label="Canceladas"
    value={data.orders.cancelled}
    hint="Cancelación / rechazo"
    tone="bad"
    onClick={() => navigate('/app/orders?group=CANCELLED')}
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
  label="Matrículas pendientes"
  value={data.specialists.certificationsPending}
  hint="Certificaciones por aprobar"
  tone={data.specialists.certificationsPending > 0 ? 'warn' : 'good'}
  onClick={() => navigate('/app/certifications?status=PENDING')}
/>

<MetricCard
  label="Antecedentes pendientes"
  value={data.specialists.backgroundPending}
  hint="Certificado de buena conducta"
  tone={data.specialists.backgroundPending > 0 ? 'warn' : 'good'}
  onClick={() => navigate('/app/background-checks?status=PENDING')}
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





