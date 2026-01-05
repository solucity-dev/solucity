// apps/admin-web/src/pages/SpecialistDetail.tsx
import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  approveCertification,
  approveKyc,
  rejectCertification,
  rejectKyc,
  type AdminSpecialistDetail,
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
  // Ajustá este key si tu proyecto usa otro nombre
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

  // usamos el type centralizado del adminApi.ts
  const typed = data as unknown as (AdminSpecialistDetail & {
    // ✅ compat: tu hook parece que trae estos extras
    subscription?: (SubscriptionDTO | null) & { daysLeft?: number | null };
    kyc?: (NonNullable<AdminSpecialistDetail['kyc']> & { id?: string }) | null;
  }) | null;

  const [avatarFailed, setAvatarFailed] = useState(false);

  // UI grant days
  const [grantDays, setGrantDays] = useState<number>(7);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantOk, setGrantOk] = useState<string | null>(null);

  // ✅ UI KYC actions
  const [kycActionLoading, setKycActionLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycOk, setKycOk] = useState<string | null>(null);

  // ✅ UI CERT actions
  const [certActionLoading, setCertActionLoading] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [certOk, setCertOk] = useState<string | null>(null);
  const [rejectCertId, setRejectCertId] = useState<string | null>(null);
  const [rejectCertReason, setRejectCertReason] = useState('');

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

  const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''); // sin trailing /

  async function safeReadJson<T>(resp: Response): Promise<T | null> {
    const text = await resp.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null; // era HTML o algo no JSON
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
          json?.message ??
            json?.error ??
            `Error al agregar días (HTTP ${resp.status}). URL: ${url}`,
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

  // ✅ KYC approve / reject
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

  // ✅ CERT approve / reject
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

  return (
    <div className="sdShell">
      <div className="sdTop">
        <div>
          <div className="sdBreadcrumb">
            <Link to="/app/specialists" className="sdBack">
              ← Volver a especialistas
            </Link>
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
          {/* Header ficha */}
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

          {/* Grid */}
          <div className="sdGrid">
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

            {/* ✅ NUEVO: Matrículas */}
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
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 12,
                            padding: 12,
                            background: '#fff',
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
                                {!!c.reviewedAt && <span className="sdMuted">Revisado: {formatDateAR(c.reviewedAt)}</span>}
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

                  {certOk && (
                    <div className="sdState" style={{ marginTop: 10 }}>
                      {certOk}
                    </div>
                  )}
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
          </div>
        </>
      )}
    </div>
  );
}











