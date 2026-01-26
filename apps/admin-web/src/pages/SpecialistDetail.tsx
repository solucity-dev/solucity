// apps/admin-web/src/pages/SpecialistDetail.tsx
import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  approveBackgroundCheck,
  approveCertification,
  approveKyc,
  deleteAdminUser,
  expireBackgroundCheck,
  rejectBackgroundCheck,
  rejectCertification,
  rejectKyc,
  requestBackgroundCheckUpdate,
  setAdminSpecialistStatus, // ✅ NUEVO
  type AdminSpecialistDetail,
  type UserStatus, // ✅ NUEVO
} from '../api/adminApi';

import { useAdminSpecialistDetail } from '../hooks/useAdminSpecialistDetail';
import { absoluteMediaUrl } from '../lib/media';
import './specialistDetail.css';

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

type SubscriptionDTO = {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  daysLeft?: number | null;
};

type GrantDaysResponse = {
  ok: boolean;
  subscription?: {
    id: string | null;
    status: string | null;
    trialEnd: string | null;
    currentPeriodEnd: string | null;
    currentPeriodStart: string | null;
  };
  notificationId?: string;
  daysGranted?: number;
  specialist?: {
    id: string;
    name: string | null;
    userId: string;
  };
  message?: string;
  error?: string;
};

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`sdChip tone-${tone}`}>{children}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sdCard">
      <div className="sdCardHead">
        <h3 className="sdCardTitle">{title}</h3>
      </div>
      <div className="sdCardBody">{children}</div>
    </section>
  );
}

function formatDateAR(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDaysLeft(days?: number | null) {
  if (days == null) return '';
  if (days <= 0) return ' (termina hoy)';
  if (days === 1) return ' (queda 1 día)';
  return ` (quedan ${days} días)`;
}

function getAdminToken(): string {
  return String(localStorage.getItem('admin_token') ?? '').trim();
}

function certTone(status?: string): Tone {
  if (status === 'APPROVED') return 'good';
  if (status === 'PENDING') return 'warn';
  if (status === 'REJECTED') return 'bad';
  return 'neutral';
}

export default function SpecialistDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAdminSpecialistDetail(id);
  const navigate = useNavigate();

  const typed = data as unknown as
    | (AdminSpecialistDetail & {
        subscription?: (SubscriptionDTO | null) & { daysLeft?: number | null };
        kyc?: (NonNullable<AdminSpecialistDetail['kyc']> & { id?: string }) | null;
        backgroundCheck?: AdminSpecialistDetail['backgroundCheck'] | null;
      })
    | null;

  const [avatarFailed, setAvatarFailed] = useState(false);

  // UI grant days
  const [grantDays, setGrantDays] = useState<number>(7);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantOk, setGrantOk] = useState<string | null>(null);

  // UI KYC actions
  const [kycActionLoading, setKycActionLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycOk, setKycOk] = useState<string | null>(null);

  // UI CERT actions
  const [certActionLoading, setCertActionLoading] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [certOk, setCertOk] = useState<string | null>(null);
  const [rejectCertId, setRejectCertId] = useState<string | null>(null);
  const [rejectCertReason, setRejectCertReason] = useState('');

  // ✅ UI BACKGROUND CHECK actions
  const [bgActionLoading, setBgActionLoading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [bgOk, setBgOk] = useState<string | null>(null);
  const [showRejectBg, setShowRejectBg] = useState(false);
  const [rejectBgReason, setRejectBgReason] = useState('');

  // ✅ Peligro / liberar email
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerErr, setDangerErr] = useState<string | null>(null);
  const [dangerOk, setDangerOk] = useState<string | null>(null);

  // ✅ Bloqueo / Activación cuenta (Especialista)
  const [acctLoading, setAcctLoading] = useState(false);
  const [acctOk, setAcctOk] = useState<string | null>(null);
  const [acctErr, setAcctErr] = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const initials = useMemo(() => {
    const n = typed?.name?.trim() || '';
    if (!n) return 'SP';
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join('');
  }, [typed?.name]);

  const kycTone: Tone =
    typed?.kycStatus === 'VERIFIED'
      ? 'good'
      : typed?.kycStatus === 'PENDING'
        ? 'warn'
        : typed?.kycStatus === 'REJECTED'
          ? 'bad'
          : 'neutral';

  const subTone: Tone =
    typed?.subscription?.status === 'ACTIVE'
      ? 'good'
      : typed?.subscription?.status === 'PAST_DUE'
        ? 'warn'
        : typed?.subscription?.status === 'CANCELLED'
          ? 'bad'
          : 'neutral';

  const avatarSrc = useMemo(() => {
    if (avatarFailed) return null;
    return absoluteMediaUrl(typed?.avatarUrl);
  }, [typed?.avatarUrl, avatarFailed]);

  const sub = (typed?.subscription ?? null) as SubscriptionDTO | null;
  const daysLeft = sub?.daysLeft ?? null;

  const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

  async function safeReadJson<T>(resp: Response): Promise<T | null> {
    const text = await resp.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async function handleGrantDays() {
    if (!typed?.specialistId) return;

    setGrantError(null);
    setGrantOk(null);

    const days = Number(grantDays);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      setGrantError('Días inválidos (1..365).');
      return;
    }

    const token = getAdminToken();
    if (!token) {
      setGrantError('Falta admin_token en localStorage. Volvé a loguearte como admin.');
      return;
    }

    if (!API_URL) {
      setGrantError('Falta VITE_API_URL en el admin-web (env).');
      return;
    }

    setGrantLoading(true);
    try {
      const url = `${API_URL}/admin/specialists/${typed.specialistId}/grant-days`;

      const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ days }),
      });

      const json = await safeReadJson<GrantDaysResponse>(resp);

      if (!resp.ok || !json?.ok) {
        setGrantError(
          json?.message ?? json?.error ?? `Error al agregar días (HTTP ${resp.status}). URL: ${url}`,
        );
        return;
      }

      setGrantOk(
        `Listo ✅ Se acreditaron ${json.daysGranted ?? days} día(s). Notificación: ${
          json.notificationId ?? '—'
        }`,
      );

      await reload();
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleApproveKyc() {
    if (!typed?.kyc?.id) return;

    setKycError(null);
    setKycOk(null);
    setKycActionLoading(true);
    try {
      await approveKyc(typed.kyc.id);
      setKycOk('KYC aprobado ✅');
      setShowReject(false);
      setRejectReason('');
      await reload();
    } catch {
      setKycError('No se pudo aprobar el KYC.');
    } finally {
      setKycActionLoading(false);
    }
  }

  async function handleRejectKyc() {
    if (!typed?.kyc?.id) return;

    const reason = rejectReason.trim();
    if (!reason) {
      setKycError('Ingresá un motivo de rechazo.');
      return;
    }

    setKycError(null);
    setKycOk(null);
    setKycActionLoading(true);
    try {
      await rejectKyc(typed.kyc.id, reason);
      setKycOk('KYC rechazado ❌ (se envió el motivo al especialista)');
      setShowReject(false);
      setRejectReason('');
      await reload();
    } catch {
      setKycError('No se pudo rechazar el KYC.');
    } finally {
      setKycActionLoading(false);
    }
  }

  const canReviewKyc = typed?.kycStatus === 'PENDING' && !!typed?.kyc?.id;

  async function handleApproveCert(certId: string) {
    setCertError(null);
    setCertOk(null);
    setCertActionLoading(true);
    try {
      await approveCertification(certId);
      setCertOk('Matrícula aprobada ✅');
      setRejectCertId(null);
      setRejectCertReason('');
      await reload();
    } catch {
      setCertError('No se pudo aprobar la matrícula.');
    } finally {
      setCertActionLoading(false);
    }
  }

  async function handleRejectCert(certId: string) {
    const reason = rejectCertReason.trim();
    if (!reason) {
      setCertError('Ingresá un motivo de rechazo.');
      return;
    }

    setCertError(null);
    setCertOk(null);
    setCertActionLoading(true);
    try {
      await rejectCertification(certId, reason);
      setCertOk('Matrícula rechazada ❌');
      setRejectCertId(null);
      setRejectCertReason('');
      await reload();
    } catch {
      setCertError('No se pudo rechazar la matrícula.');
    } finally {
      setCertActionLoading(false);
    }
  }

  async function handleApproveBackgroundCheck() {
    if (!typed?.backgroundCheck?.id) return;

    setBgError(null);
    setBgOk(null);
    setBgActionLoading(true);
    try {
      await approveBackgroundCheck(typed.backgroundCheck.id);
      setBgOk('Antecedentes aprobados ✅');
      setShowRejectBg(false);
      setRejectBgReason('');
      await reload();
    } catch {
      setBgError('No se pudo aprobar antecedentes.');
    } finally {
      setBgActionLoading(false);
    }
  }

  async function handleRejectBackgroundCheck() {
    if (!typed?.backgroundCheck?.id) return;

    const reason = rejectBgReason.trim();
    if (!reason) {
      setBgError('Ingresá un motivo de rechazo.');
      return;
    }

    setBgError(null);
    setBgOk(null);
    setBgActionLoading(true);
    try {
      await rejectBackgroundCheck(typed.backgroundCheck.id, reason);
      setBgOk('Antecedentes rechazados ❌');
      setShowRejectBg(false);
      setRejectBgReason('');
      await reload();
    } catch {
      setBgError('No se pudo rechazar antecedentes.');
    } finally {
      setBgActionLoading(false);
    }
  }

  async function handleRequestBgUpdate() {
    if (!typed?.backgroundCheck?.id) return;

    setBgError(null);
    setBgOk(null);
    setBgActionLoading(true);
    try {
      await requestBackgroundCheckUpdate(typed.backgroundCheck.id);
      setBgOk('Se pidió actualización ✅ (se envió notificación al especialista)');
    } catch {
      setBgError('No se pudo pedir actualización.');
    } finally {
      setBgActionLoading(false);
    }
  }

  async function handleExpireBg() {
    if (!typed?.backgroundCheck?.id) return;

    const ok = window.confirm(
      '¿Marcar como VENCIDO?\n\nEsto va a rechazar el antecedente, bloquear disponibilidad y notificar.',
    );
    if (!ok) return;

    setBgError(null);
    setBgOk(null);
    setBgActionLoading(true);
    try {
      await expireBackgroundCheck(typed.backgroundCheck.id);
      setBgOk('Marcado como vencido ⛔ (bloqueado y notificado)');
      await reload();
    } catch {
      setBgError('No se pudo marcar como vencido.');
    } finally {
      setBgActionLoading(false);
    }
  }

  // ✅ bloquear / activar especialista (con motivo)
  async function handleConfirmBlock() {
    if (!typed?.userId) return;

    const reason = blockReason.trim();
    if (!reason || reason.length < 3) {
      setAcctErr('Ingresá un motivo (mínimo 3 caracteres).');
      return;
    }

    setAcctErr(null);
    setAcctOk(null);
    setAcctLoading(true);

    try {
      await setAdminSpecialistStatus(typed.userId, 'BLOCKED' as UserStatus, reason);
      setAcctOk('Usuario bloqueado ✅ (se notificará al especialista).');
      setShowBlockModal(false);
      setBlockReason('');
      await reload();
    } catch {
      setAcctErr('No se pudo bloquear el usuario.');
    } finally {
      setAcctLoading(false);
    }
  }

  async function handleActivate() {
    if (!typed?.userId) return;

    const ok = window.confirm('¿Activar nuevamente este usuario?');
    if (!ok) return;

    setAcctErr(null);
    setAcctOk(null);
    setAcctLoading(true);

    try {
      await setAdminSpecialistStatus(typed.userId, 'ACTIVE' as UserStatus);
      setAcctOk('Usuario activado ✅');
      await reload();
    } catch {
      setAcctErr('No se pudo activar el usuario.');
    } finally {
      setAcctLoading(false);
    }
  }

  // ✅ liberar email (anonymize)
  async function handleFreeEmail() {
    if (!typed?.userId || !typed?.email) return;

    const ok = window.confirm(
      `¿Liberar el email "${typed.email}"?\n\nEsto cambia el email del usuario a deleted+... y lo bloquea.\n✅ Te permite registrar otra vez con el email original.`,
    );
    if (!ok) return;

    setDangerErr(null);
    setDangerOk(null);
    setDangerLoading(true);
    try {
      const r = await deleteAdminUser(typed.userId, 'anonymize');
      if (!r.ok) throw new Error('No se pudo liberar el email');
      setDangerOk(`Listo ✅ Email liberado. Nuevo email: ${r.newEmail ?? '—'}`);
      await reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Error al liberar email';
      setDangerErr(msg);
    } finally {
      setDangerLoading(false);
    }
  }

  return (
    <div className="sdShell">
      <div className="sdTop">
        <div>
          <div className="sdBreadcrumb">
            <button className="sdBack" onClick={() => navigate(-1)} type="button">
              ← Volver a especialistas
            </button>
          </div>

          <h1 className="sdTitle">Detalle del especialista</h1>
          <p className="sdSubtitle">Perfil, KYC, rubros y suscripción</p>
        </div>

        <button className="sdBtn" onClick={reload} disabled={loading || !id}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {!id && <div className="sdState sdError">Error: falta el ID en la URL.</div>}

      {id && error && <div className="sdState sdError">Error: {error}</div>}

      {id && !error && !typed && <div className="sdState">{loading ? 'Cargando…' : 'Sin datos'}</div>}

      {typed && (
        <>
          <div className="sdHero">
            <div className="sdAvatar">
              {avatarSrc ? (
                <img
                  className="sdAvatarImg"
                  src={avatarSrc ?? undefined}
                  alt={typed.name}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div className="sdAvatarFallback">{initials}</div>
              )}
            </div>

            <div className="sdHeroMain">
              <div className="sdNameRow">
                <div className="sdName">{typed.name}</div>

                <Chip tone={kycTone}>KYC: {typed.kycStatus}</Chip>

                {sub ? <Chip tone={subTone}>SUB: {sub.status}</Chip> : <Chip tone="neutral">Sin suscripción</Chip>}
              </div>

              <div className="sdMeta">
                <div>
                  <span className="sdMetaLabel">Email</span>
                  <div className="sdMetaValue">{typed.email}</div>
                </div>

                <div>
                  <span className="sdMetaLabel">Estado</span>
                  <div className="sdMetaValue">{typed.status}</div>
                </div>

                <div>
                  <span className="sdMetaLabel">Rating</span>
                  <div className="sdMetaValue">
                    {typed.ratingAvg != null ? typed.ratingAvg.toFixed(1) : '—'}{' '}
                    <span className="sdMuted">({typed.ratingCount ?? 0})</span>
                  </div>
                </div>

                <div>
                  <span className="sdMetaLabel">Badge</span>
                  <div className="sdMetaValue">{typed.badge ?? '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="sdGrid">
            {/* ✅ NUEVO: Cuenta / Bloqueo */}
            <Card title="Cuenta (bloqueo)">
              <div className="sdMuted" style={{ marginBottom: 10 }}>
                Bloquear un especialista:
                <br />• Deshabilita su disponibilidad (availableNow=false)
                <br />• Le impide operar hasta reactivación
                <br />• Envía notificación con el motivo
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {typed.status === 'ACTIVE' ? (
                  <button
                    className="sdBtn"
                    onClick={() => {
                      setAcctOk(null);
                      setAcctErr(null);
                      setShowBlockModal(true);
                    }}
                    disabled={acctLoading}
                    style={{ backgroundColor: '#ffe6e6', color: '#8b0000' }}
                  >
                    🚫 Bloquear especialista
                  </button>
                ) : (
                  <button className="sdBtn" onClick={handleActivate} disabled={acctLoading}>
                    ✅ Activar especialista
                  </button>
                )}
              </div>

              {showBlockModal && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    className="sdInput"
                    placeholder="Motivo del bloqueo (visible para el usuario). Ej: Incumplimiento de políticas…"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    rows={3}
                    style={{ width: '100%' }}
                    disabled={acctLoading}
                  />

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      className="sdBtn"
                      onClick={handleConfirmBlock}
                      disabled={acctLoading}
                      style={{ backgroundColor: '#ffe6e6', color: '#8b0000' }}
                    >
                      {acctLoading ? 'Procesando…' : 'Confirmar bloqueo'}
                    </button>

                    <button
                      className="sdBtn"
                      onClick={() => {
                        setShowBlockModal(false);
                        setBlockReason('');
                        setAcctErr(null);
                      }}
                      disabled={acctLoading}
                      style={{ backgroundColor: '#eee', color: '#333' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {acctOk && <div className="sdState" style={{ marginTop: 12 }}>{acctOk}</div>}
              {acctErr && (
                <div className="sdState sdError" style={{ marginTop: 12 }}>
                  {acctErr}
                </div>
              )}
            </Card>

            <Card title="Perfil">
              <div className="sdKV">
                <div className="k">
                  <span>Disponible ahora</span>
                  <strong>
                    {typeof typed.availableNow === 'boolean' ? (typed.availableNow ? 'Sí' : 'No') : '—'}
                  </strong>
                </div>

                <div className="k">
                  <span>Radio</span>
                  <strong>{typed.radiusKm != null ? `${typed.radiusKm} km` : '—'}</strong>
                </div>

                <div className="k">
                  <span>Visita</span>
                  <strong>
                    {typed.visitPrice != null ? `$${typed.visitPrice}` : '—'} {typed.currency ?? ''}
                  </strong>
                </div>
              </div>

              <div className="sdBlock">
                <div className="sdBlockLabel">Bio</div>
                <div className="sdBlockText">{typed.bio?.trim() ? typed.bio : '—'}</div>
              </div>
            </Card>

            <Card title="Rubros">
              {typed.specialties.length === 0 ? (
                <div className="sdMuted">No tiene rubros cargados.</div>
              ) : (
                <div className="sdTags">
                  {typed.specialties.map((s) => (
                    <span key={s.id} className="sdTag">
                      {s.name}
                      <span className="sdTagSlug">{s.slug}</span>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Matrículas / Certificaciones">
              {!typed.certifications || typed.certifications.length === 0 ? (
                <div className="sdMuted">No tiene matrículas subidas.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {typed.certifications
                    .slice()
                    .sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'es'))
                    .map((c) => {
                      const fileHref = absoluteMediaUrl(c.fileUrl) ?? '#';
                      const pending = c.status === 'PENDING';
                      const openReject = rejectCertId === c.id;

                      return (
                        <div
                          key={c.id}
                          style={{
                            border: '1px solid rgba(255,255,255,0.14)',
                            borderRadius: 14,
                            padding: 12,
                            background: 'rgba(255,255,255,0.06)',
                          }}

                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <strong>{c.category?.name ?? c.category?.slug ?? 'Rubro'}</strong>
                                <Chip tone={certTone(c.status)}>DOC: {c.status}</Chip>
                              </div>

                              <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {!!c.createdAt && <span className="sdMuted">Subido: {formatDateAR(c.createdAt)}</span>}
                                {!!c.reviewedAt && (
                                  <span className="sdMuted">Revisado: {formatDateAR(c.reviewedAt)}</span>
                                )}
                                {!!c.number && <span className="sdMuted">N°: {c.number}</span>}
                                {!!c.issuer && <span className="sdMuted">Emisor: {c.issuer}</span>}
                                {!!c.expiresAt && <span className="sdMuted">Vence: {formatDateAR(c.expiresAt)}</span>}
                              </div>

                              {c.rejectionReason ? (
                                <div className="sdMuted" style={{ marginTop: 6 }}>
                                  Motivo: {c.rejectionReason}
                                </div>
                              ) : null}

                              <div style={{ marginTop: 10 }}>
                                <a
                                  className={`sdLink ${c.fileUrl ? '' : 'disabled'}`}
                                  href={fileHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => !c.fileUrl && e.preventDefault()}
                                >
                                  Ver archivo
                                </a>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                              <button
                                className="sdBtn"
                                onClick={() => handleApproveCert(c.id)}
                                disabled={certActionLoading || !pending}
                                title={!pending ? 'Sólo se puede aprobar si está PENDING' : 'Aprobar matrícula'}
                                style={!pending ? { opacity: 0.5 } : undefined}
                              >
                                ✅ Aprobar
                              </button>

                              <button
                                className="sdBtn"
                                onClick={() => {
                                  setCertOk(null);
                                  setCertError(null);
                                  setRejectCertId(openReject ? null : c.id);
                                  setRejectCertReason('');
                                }}
                                disabled={certActionLoading || !pending}
                                style={!pending ? { opacity: 0.5 } : { backgroundColor: '#ffe6e6', color: '#8b0000' }}
                                title={!pending ? 'Sólo se puede rechazar si está PENDING' : 'Rechazar matrícula'}
                              >
                                ❌ Rechazar
                              </button>
                            </div>
                          </div>

                          {openReject && (
                            <div style={{ marginTop: 10 }}>
                              <textarea
                                className="sdInput"
                                placeholder="Motivo del rechazo (visible para el especialista)"
                                value={rejectCertReason}
                                onChange={(e) => setRejectCertReason(e.target.value)}
                                rows={3}
                                style={{ width: '100%' }}
                                disabled={certActionLoading}
                              />

                              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  className="sdBtn"
                                  onClick={() => handleRejectCert(c.id)}
                                  disabled={certActionLoading}
                                  title="Enviar motivo y rechazar"
                                >
                                  {certActionLoading ? 'Procesando…' : 'Confirmar rechazo'}
                                </button>

                                <button
                                  className="sdBtn"
                                  style={{ backgroundColor: '#eee', color: '#333' }}
                                  onClick={() => {
                                    setRejectCertId(null);
                                    setRejectCertReason('');
                                    setCertError(null);
                                  }}
                                  disabled={certActionLoading}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {certOk && <div className="sdState" style={{ marginTop: 10 }}>{certOk}</div>}
                  {certError && (
                    <div className="sdState sdError" style={{ marginTop: 10 }}>
                      {certError}
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card title="KYC (última presentación)">
              {!typed.kyc ? (
                <div className="sdMuted">Sin envío KYC.</div>
              ) : (
                <div className="sdKyc">
                  <div className="sdKycRow">
                    <span className="sdKycLabel">Estado</span>
                    <Chip tone={kycTone}>{typed.kyc.status ?? typed.kycStatus}</Chip>
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!!typed.kyc.createdAt && <span className="sdMuted">Enviado: {formatDateAR(typed.kyc.createdAt)}</span>}
                    {!!typed.kyc.reviewedAt && <span className="sdMuted">Revisado: {formatDateAR(typed.kyc.reviewedAt)}</span>}
                    {!!typed.kyc.rejectionReason && <span className="sdMuted">Motivo: {typed.kyc.rejectionReason}</span>}
                  </div>

                  <div className="sdKycLinks" style={{ marginTop: 10 }}>
                    <a
                      className={`sdLink ${typed.kyc.dniFrontUrl ? '' : 'disabled'}`}
                      href={absoluteMediaUrl(typed.kyc.dniFrontUrl) ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => !typed.kyc?.dniFrontUrl && e.preventDefault()}
                    >
                      DNI frente
                    </a>

                    <a
                      className={`sdLink ${typed.kyc.dniBackUrl ? '' : 'disabled'}`}
                      href={absoluteMediaUrl(typed.kyc.dniBackUrl) ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => !typed.kyc?.dniBackUrl && e.preventDefault()}
                    >
                      DNI dorso
                    </a>

                    <a
                      className={`sdLink ${typed.kyc.selfieUrl ? '' : 'disabled'}`}
                      href={absoluteMediaUrl(typed.kyc.selfieUrl) ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => !typed.kyc?.selfieUrl && e.preventDefault()}
                    >
                      Selfie
                    </a>
                  </div>

                  {canReviewKyc && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="sdBtn" onClick={handleApproveKyc} disabled={kycActionLoading}>
                          {kycActionLoading ? 'Procesando…' : '✅ Aprobar KYC'}
                        </button>

                        <button
                          className="sdBtn"
                          onClick={() => {
                            setKycOk(null);
                            setKycError(null);
                            setShowReject((v) => !v);
                          }}
                          disabled={kycActionLoading}
                          style={{ backgroundColor: '#ffe6e6', color: '#8b0000' }}
                        >
                          ❌ Rechazar
                        </button>
                      </div>

                      {showReject && (
                        <div style={{ marginTop: 10 }}>
                          <textarea
                            className="sdInput"
                            placeholder="Motivo del rechazo (visible para el especialista)"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            style={{ width: '100%' }}
                            disabled={kycActionLoading}
                          />

                          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="sdBtn" onClick={handleRejectKyc} disabled={kycActionLoading}>
                              {kycActionLoading ? 'Procesando…' : 'Confirmar rechazo'}
                            </button>

                            <button
                              className="sdBtn"
                              style={{ backgroundColor: '#eee', color: '#333' }}
                              onClick={() => {
                                setShowReject(false);
                                setRejectReason('');
                                setKycError(null);
                              }}
                              disabled={kycActionLoading}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {kycOk && <div className="sdState" style={{ marginTop: 10 }}>{kycOk}</div>}
                      {kycError && <div className="sdState sdError" style={{ marginTop: 10 }}>{kycError}</div>}
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card title="Antecedentes (Background Check)">
              {!typed.backgroundCheck ? (
                <div className="sdMuted">Sin antecedentes subidos.</div>
              ) : (
                <div>
                  <div className="sdKV">
                    <div className="k">
                      <span>Estado</span>
                      <strong>{typed.backgroundCheck.status}</strong>
                    </div>

                    <div className="k">
                      <span>Subido</span>
                      <strong>{formatDateAR(typed.backgroundCheck.createdAt)}</strong>
                    </div>

                    <div className="k">
                      <span>Revisado</span>
                      <strong>{formatDateAR(typed.backgroundCheck.reviewedAt)}</strong>
                    </div>
                  </div>

                  {typed.backgroundCheck.rejectionReason ? (
                    <div className="sdMuted" style={{ marginTop: 8 }}>
                      Motivo: {typed.backgroundCheck.rejectionReason}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
                    <a
                      className={`sdLink ${typed.backgroundCheck.fileUrl ? '' : 'disabled'}`}
                      href={absoluteMediaUrl(typed.backgroundCheck.fileUrl) ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => !typed.backgroundCheck?.fileUrl && e.preventDefault()}
                    >
                      Ver archivo
                    </a>
                  </div>

                  {/* ✅ Acciones manuales */}
                  <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="sdBtn" onClick={handleRequestBgUpdate} disabled={bgActionLoading}>
                      📩 Pedir actualización
                    </button>

                    <button
                      className="sdBtn"
                      onClick={handleExpireBg}
                      disabled={bgActionLoading}
                      style={{ backgroundColor: '#ffe6e6', color: '#8b0000' }}
                    >
                      ⛔ Marcar vencido
                    </button>
                  </div>

                  {typed.backgroundCheck.status === 'PENDING' && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="sdBtn" onClick={handleApproveBackgroundCheck} disabled={bgActionLoading}>
                          {bgActionLoading ? 'Procesando…' : '✅ Aprobar'}
                        </button>

                        <button
                          className="sdBtn"
                          onClick={() => {
                            setBgOk(null);
                            setBgError(null);
                            setShowRejectBg((v) => !v);
                          }}
                          disabled={bgActionLoading}
                          style={{ backgroundColor: '#ffe6e6', color: '#8b0000' }}
                        >
                          ❌ Rechazar
                        </button>
                      </div>

                      {showRejectBg && (
                        <div style={{ marginTop: 10 }}>
                          <textarea
                            className="sdInput"
                            placeholder="Motivo del rechazo (visible para el especialista)"
                            value={rejectBgReason}
                            onChange={(e) => setRejectBgReason(e.target.value)}
                            rows={3}
                            style={{ width: '100%' }}
                            disabled={bgActionLoading}
                          />

                          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="sdBtn" onClick={handleRejectBackgroundCheck} disabled={bgActionLoading}>
                              {bgActionLoading ? 'Procesando…' : 'Confirmar rechazo'}
                            </button>

                            <button
                              className="sdBtn"
                              style={{ backgroundColor: '#eee', color: '#333' }}
                              onClick={() => {
                                setShowRejectBg(false);
                                setRejectBgReason('');
                                setBgError(null);
                              }}
                              disabled={bgActionLoading}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {bgOk && <div className="sdState" style={{ marginTop: 10 }}>{bgOk}</div>}
                      {bgError && <div className="sdState sdError" style={{ marginTop: 10 }}>{bgError}</div>}
                    </div>
                  )}

                  {typed.backgroundCheck.status !== 'PENDING' && (
                    <div className="sdMuted" style={{ marginTop: 12 }}>
                      Este antecedente ya fue revisado.
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card title="Suscripción">
              {!sub ? (
                <div className="sdMuted">No hay suscripción asociada.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="sdMuted">Agregar días:</span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={grantDays}
                        onChange={(e) => setGrantDays(Number(e.target.value))}
                        className="sdInput"
                        style={{ width: 110 }}
                        disabled={grantLoading}
                      />
                    </div>

                    <button className="sdBtn" onClick={handleGrantDays} disabled={grantLoading}>
                      {grantLoading ? 'Agregando…' : 'Agregar'}
                    </button>

                    {grantOk && <span className="sdMuted">{grantOk}</span>}
                    {grantError && <span className="sdState sdError">{grantError}</span>}
                  </div>

                  <div className="sdKV">
                    <div className="k">
                      <span>Estado</span>
                      <strong>{sub.status}</strong>
                    </div>

                    <div className="k">
                      <span>Trial end</span>
                      <strong>
                        {formatDateAR(sub.trialEnd)}
                        {formatDaysLeft(daysLeft)}
                      </strong>
                    </div>

                    <div className="k">
                      <span>Period end</span>
                      <strong>{formatDateAR(sub.currentPeriodEnd)}</strong>
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* ✅ NUEVO: Peligro */}
            <Card title="Peligro (testing)">
              <div className="sdMuted" style={{ marginBottom: 10 }}>
                Usá esto para volver a registrar con el mismo correo.
              </div>

              <button
                className="sdBtn"
                onClick={handleFreeEmail}
                disabled={dangerLoading}
                style={{ backgroundColor: '#ffe6e6', color: '#8b0000' }}
              >
                {dangerLoading ? 'Procesando…' : '🧹 Liberar email (recomendado)'}
              </button>

              {dangerOk && <div className="sdState" style={{ marginTop: 10 }}>{dangerOk}</div>}
              {dangerErr && <div className="sdState sdError" style={{ marginTop: 10 }}>{dangerErr}</div>}

              <div className="sdMuted" style={{ marginTop: 12 }}>
                Nota: “Hard delete” existe en backend pero puede fallar por FKs. Para testing usá anonymize.
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}












