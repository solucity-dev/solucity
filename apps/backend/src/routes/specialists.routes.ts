// apps/backend/src/routes/specialists.routes.ts
import fs from 'fs';
import path from 'path';

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';

import { signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { ensureDir, uploadsRoot } from '../lib/uploads';
import { auth } from '../middlewares/auth';
import { geocodeAddress } from '../services/geocode';
import { notifyBackgroundCheckStatus } from '../services/notifyBackgroundCheck';
import { notifyKycStatus } from '../services/notifyKyc';
import { canSpecialistBeVisible, type SubscriptionGate } from '../services/subscriptionGate';
import { getOrCreateSubscriptionForSpecialist } from '../services/subscriptionService';
import { dbg, debugUploads } from '../utils/debug';

/** ========= Storage local (MVP) ========= **/

const router = Router();

const KYC_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function isHeicLike(mime?: string | null) {
  const m = String(mime ?? '').toLowerCase();
  return m === 'image/heic' || m === 'image/heif';
}

function isStandardProcessableImage(mime?: string | null) {
  const m = String(mime ?? '').toLowerCase();
  return m === 'image/jpeg' || m === 'image/jpg' || m === 'image/png' || m === 'image/webp';
}

function getExtensionFromMime(mime?: string | null) {
  const m = String(mime ?? '').toLowerCase();

  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/heic') return '.heic';
  if (m === 'image/heif') return '.heif';

  return '';
}

const kycDir = path.join(uploadsRoot, 'kyc');
const certsDir = path.join(uploadsRoot, 'certifications');
const backgroundChecksDir = path.join(uploadsRoot, 'background-checks');
const portfolioDir = path.join(uploadsRoot, 'portfolio');

ensureDir(kycDir);
ensureDir(certsDir);
ensureDir(backgroundChecksDir);
ensureDir(portfolioDir);

if (debugUploads) {
  dbg(debugUploads, '[specialists.routes] uploadsRoot =', uploadsRoot);
  dbg(debugUploads, '[specialists.routes] kycDir =', kycDir);
  dbg(debugUploads, '[specialists.routes] certsDir =', certsDir);
  dbg(debugUploads, '[specialists.routes] backgroundChecksDir =', backgroundChecksDir);
  dbg(debugUploads, '[specialists.routes] portfolioDir =', portfolioDir);
}

/** ========= Multer storages ========= **/
const storageKyc = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, kycDir),
  filename: (_req, file, cb) => {
    const originalExt = path.extname(file.originalname || '');
    const mimeExt = getExtensionFromMime(file.mimetype);
    const ext = (originalExt || mimeExt || '.jpg').toLowerCase();

    const rawBase = path.basename(file.originalname || 'kyc_upload', originalExt || '');
    const base = rawBase.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '') || 'kyc_upload';

    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const storageCerts = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, certsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const storageBackgroundChecks = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, backgroundChecksDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const storagePortfolio = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, portfolioDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

/** Solo imágenes (JPEG/PNG/WebP) — KYC */
const upload = multer({
  storage: storageKyc,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype ?? '').toLowerCase();
    const ok = KYC_ALLOWED_MIME_TYPES.has(mime);

    if (!ok) return cb(new Error('unsupported_type'));
    cb(null, true);
  },
});

/** Imágenes o PDF — Certificaciones */
const uploadAny = multer({
  storage: storageCerts,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (_req, file, cb) => {
    const isImg = /^image\/(jpe?g|png|webp)$/i.test(file.mimetype);
    const isPdf = file.mimetype === 'application/pdf';
    if (!isImg && !isPdf) return cb(new Error('unsupported_type'));
    cb(null, true);
  },
});

/** PDF o imagen — Antecedente penal */
const uploadBackgroundCheck = multer({
  storage: storageBackgroundChecks,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (_req, file, cb) => {
    const isImg = /^image\/(jpe?g|png|webp)$/i.test(file.mimetype);
    const isPdf = file.mimetype === 'application/pdf';
    if (!isImg && !isPdf) return cb(new Error('unsupported_type'));
    cb(null, true);
  },
});

/** Solo imágenes — Portfolio */
const uploadPortfolio = multer({
  storage: storagePortfolio,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|webp)$/i.test(file.mimetype);
    if (!ok) return cb(new Error('unsupported_type'));
    cb(null, true);
  },
});

type MulterReq = Request & { file?: Express.Multer.File };
type AuthReq = Request & { user?: { id: string; role: string } };

const debugSpecialists = process.env.DEBUG_SPECIALISTS === '1';

function logSearchStep(startMs: number, label: string, extra?: Record<string, unknown>) {
  if (!debugSpecialists) return;

  const elapsedMs = Date.now() - startMs;
  dbg(debugSpecialists, `[GET /specialists/search][timing] ${label}`, {
    elapsedMs,
    ...(extra ?? {}),
  });
}

const KYC_MAX_OUTPUT_WIDTH = 1600;
const KYC_MAX_OUTPUT_HEIGHT = 1600;
const SHARP_LIMIT_INPUT_PIXELS = 12000 * 12000;

/** Util: normalizar URL absoluta a partir de /uploads/... */
function toAbsoluteUrl(u: string): string {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ||
    `http://localhost:${process.env.PORT || 3000}`;
  return `${base}${u.startsWith('/') ? '' : '/'}${u}`;
}

/** Validador de URL absoluta o relativa /uploads/... */
const urlLike = z
  .string()
  .refine((s) => /^https?:\/\//i.test(s) || s.startsWith('/uploads/'), 'invalid_url');

/** helper: error handling multer */
function multerErrorToResponse(err: any, res: Response) {
  if (!err) return false;

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: 'file_too_large' });
  }
  if (err?.message === 'unsupported_type') {
    return res.status(415).json({ ok: false, error: 'unsupported_type' });
  }

  // ✅ fallback: cualquier otro error de multer / filesystem
  return res.status(400).json({ ok: false, error: 'upload_failed' });
}

/** ========= HORARIOS =========
 * Regla:
 * - Si NO hay availability bien configurado => NO bloquea (se ve igual)
 * - Si hay days/start/end => debe respetar
 */
function isWithinAvailability(
  availability: any,
  now = new Date(),
  timeZone = 'America/Argentina/Cordoba',
): boolean {
  if (!availability) return true;

  const days: number[] = Array.isArray(availability.days) ? availability.days : [];

  const ranges: { start: string; end: string }[] = Array.isArray(availability.ranges)
    ? availability.ranges
        .filter(
          (r: any) =>
            r &&
            typeof r.start === 'string' &&
            /^\d{2}:\d{2}$/.test(r.start) &&
            typeof r.end === 'string' &&
            /^\d{2}:\d{2}$/.test(r.end),
        )
        .map((r: any) => ({ start: r.start, end: r.end }))
    : availability.start && availability.end
      ? [{ start: availability.start, end: availability.end }]
      : [];

  // si falta algo => no bloquea
  if (!days.length || !ranges.length) return true;

  // fecha local en timezone
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = Number(dateParts.find((p) => p.type === 'year')?.value ?? '1970');
  const m = Number(dateParts.find((p) => p.type === 'month')?.value ?? '01');
  const d = Number(dateParts.find((p) => p.type === 'day')?.value ?? '01');

  // día de semana en esa fecha (0..6)
  const localDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayIndex = localDate.getUTCDay();

  if (!days.includes(dayIndex)) return false;

  // hora local en timezone
  const timeParts = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(timeParts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(timeParts.find((p) => p.type === 'minute')?.value ?? '0');
  const currentMins = hour * 60 + minute;

  for (const range of ranges) {
    const [sh, sm] = range.start.split(':').map(Number);
    const [eh, em] = range.end.split(':').map(Number);

    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
      continue;
    }

    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    // 24hs: si start === end, se considera abierto todo el día
    if (startMins === endMins) return true;

    // rango normal
    if (endMins > startMins) {
      if (currentMins >= startMins && currentMins <= endMins) return true;
      continue;
    }

    // cruce de medianoche
    if (currentMins >= startMins || currentMins <= endMins) return true;
  }

  return false;
}

/** ===== helper: sync search index ===== */
async function syncSearchIndexForUser(userId: string) {
  const spec = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      centerLat: true,
      centerLng: true,
      radiusKm: true,
      kycStatus: true,
      availableNow: true,
      visitPrice: true,
      ratingAvg: true,
      ratingCount: true,
      badge: true,
      serviceModes: true,
      user: { select: { status: true } },
      backgroundCheck: { select: { status: true } },
      specialties: {
        include: {
          category: { select: { slug: true, group: { select: { slug: true } } } },
        },
      },
    },
  });

  if (!spec) return;

  const categorySlugs = spec.specialties.map((s) => s.category.slug);
  const groupSlugs = Array.from(new Set(spec.specialties.map((s) => s.category.group.slug)));

  const centerLat = spec.centerLat ?? 0;
  const centerLng = spec.centerLng ?? 0;
  const radiusKm = spec.radiusKm ?? 30;

  // availableNow solo true si está VERIFIED
  const userOk = spec.user?.status !== 'BLOCKED';

  const requiresBackgroundCheck = requiresBackgroundCheckByServiceModes(spec.serviceModes);
  const bgApproved = spec.backgroundCheck?.status === 'APPROVED';
  const bgOk = requiresBackgroundCheck ? bgApproved : true;

  const safeAvailableNow =
    userOk && spec.kycStatus === 'VERIFIED' && bgOk ? (spec.availableNow ?? false) : false;

  await prisma.specialistSearchIndex.upsert({
    where: { specialistId: spec.id },
    create: {
      specialistId: spec.id,
      groupSlugs,
      categorySlugs,
      centerLat,
      centerLng,
      radiusKm,
      ratingAvg: spec.ratingAvg ?? 0,
      ratingCount: spec.ratingCount ?? 0,
      verified: spec.kycStatus === 'VERIFIED',
      availableNow: safeAvailableNow,
      visitPrice: spec.visitPrice ?? 0,
      badge: (spec.badge as any) ?? 'BRONZE',
    },
    update: {
      groupSlugs,
      categorySlugs,
      centerLat,
      centerLng,
      radiusKm,
      ratingAvg: spec.ratingAvg ?? 0,
      ratingCount: spec.ratingCount ?? 0,
      verified: spec.kycStatus === 'VERIFIED',
      availableNow: safeAvailableNow,
      visitPrice: spec.visitPrice ?? 0,
      badge: (spec.badge as any) ?? 'BRONZE',
    },
  });
}

async function hasApprovedBackgroundCheck(specialistId: string) {
  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { specialistId },
    select: { status: true },
  });
  return bg?.status === 'APPROVED';
}

function normalizeStoredServiceModes(input: any): ('HOME' | 'OFFICE' | 'ONLINE')[] {
  const allowed = new Set(['HOME', 'OFFICE', 'ONLINE']);

  if (!Array.isArray(input)) return [];

  const out = Array.from(
    new Set(
      input
        .map((x) =>
          String(x ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((x) => allowed.has(x)),
    ),
  ).sort();

  return out as ('HOME' | 'OFFICE' | 'ONLINE')[];
}

function hasExplicitServiceModes(input: any): boolean {
  return normalizeStoredServiceModes(input).length > 0;
}

function getEffectiveServiceModes(input: any): ('HOME' | 'OFFICE' | 'ONLINE')[] {
  const normalized = normalizeStoredServiceModes(input);

  // ✅ legacy-safe: si no hay modalidades explícitas, tratamos como HOME
  return normalized.length > 0 ? normalized : ['HOME'];
}

function requiresBackgroundCheckByServiceModes(input: any): boolean {
  const normalized = normalizeStoredServiceModes(input);

  // ✅ legacy-safe:
  // sin modalidades explícitas => seguimos exigiendo antecedentes
  if (normalized.length === 0) return true;

  // ✅ nueva regla deseada:
  // requiere antecedentes solo si ofrece HOME y NO ofrece OFFICE
  return normalized.includes('HOME') && !normalized.includes('OFFICE');
}

async function getMaxAllowedRadiusKmForUser(userId: string): Promise<number> {
  const spec = await prisma.specialistProfile.findUnique({
    where: { userId },
    select: {
      specialties: {
        select: {
          category: { select: { slug: true } },
        },
      },
    },
  });

  const slugs = spec?.specialties.map((s) => s.category.slug) ?? [];
  return slugs.includes('auxilio-vehicular') ? 400 : 30;
}

/** ===== helper: disponibilidad real (KYC + BG + horario + toggle + user ok) ===== */
async function computeSafeAvailability(opts: {
  userId: string;
  specialistId: string;
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | string;
  availableNow: boolean | null | undefined;
  availability: any;
}) {
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { status: true },
  });

  const userOk = user?.status !== 'BLOCKED';
  const kycOk = opts.kycStatus === 'VERIFIED';

  const spec = await prisma.specialistProfile.findUnique({
    where: { id: opts.specialistId },
    select: { serviceModes: true },
  });

  const serviceModesConfigured = hasExplicitServiceModes(spec?.serviceModes);
  const effectiveServiceModes = getEffectiveServiceModes(spec?.serviceModes);
  const requiresBackgroundCheck = requiresBackgroundCheckByServiceModes(spec?.serviceModes);

  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { specialistId: opts.specialistId },
    select: { status: true },
  });

  const bgApproved = bg?.status === 'APPROVED';
  const bgOk = requiresBackgroundCheck ? bgApproved : true;

  const gate = await canSpecialistBeVisible(opts.userId);
  const subOk = gate.ok; // ACTIVE o TRIALING válido

  const toggleOk = !!opts.availableNow;
  const scheduleOk = isWithinAvailability(opts.availability);

  return {
    userOk,
    kycOk,
    bgOk,
    bgApproved,
    requiresBackgroundCheck,
    serviceModesConfigured,
    serviceModes: effectiveServiceModes,
    subOk,
    toggleOk,
    scheduleOk,
    canToggle: userOk && kycOk && bgOk,
    visibleNow: userOk && kycOk && bgOk && toggleOk && scheduleOk,
  };
}

const SPECIALIST_SATURATION_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] as const;
const MAX_ACTIVE_ORDERS_SPECIALIST = 3;

function resolveSubscriptionGateFromData(
  sub?: {
    status: string | null;
    trialEnd: Date | null;
    currentPeriodEnd: Date | null;
  } | null,
): SubscriptionGate {
  if (!sub) return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: null };

  const now = new Date();

  if (sub.status === 'TRIALING') {
    if (sub.trialEnd && sub.trialEnd > now) {
      return { ok: true, status: 'TRIALING' };
    }
    return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: 'PAST_DUE' };
  }

  if (sub.status === 'ACTIVE') {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      return { ok: true, status: 'ACTIVE' };
    }
    return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: 'PAST_DUE' };
  }

  return { ok: false, reason: 'SUBSCRIPTION_REQUIRED', status: sub.status };
}

/** ===== helper: stats de contrataciones ===== */
async function getSpecialistStatsById(specialistId: string) {
  const [done, canceled] = await Promise.all([
    prisma.serviceOrder.count({
      where: { specialistId, status: { in: ['CONFIRMED_BY_CLIENT', 'CLOSED'] as any } },
    }),
    prisma.serviceOrder.count({
      where: {
        specialistId,
        status: {
          in: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SPECIALIST', 'CANCELLED_AUTO'] as any,
        },
      },
    }),
  ]);

  return { done, canceled };
}

/* ─────────────────────────────────────────────────────────────────────
 * RUTAS PÚBLICAS
 * ────────────────────────────────────────────────────────────────────*/

/**
 * GET /specialists/search?category=<slug>&lat=&lng=&radiusKm=
 *       [&verified=true|false] [&availableNow=true|false] [&enabled=true|false]
 *       [&priceMin=] [&priceMax=] [&sort=distance|rating|price]
 */
router.get('/search', async (req, res) => {
  const searchStartedAt = Date.now();
  // ✅ evita caches (proxy, cdn, etc)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  dbg(debugSpecialists, '[GET /specialists/search]', {
    category: req.query.category,
    lat: req.query.lat,
    lng: req.query.lng,
    radiusKm: req.query.radiusKm,
    verified: req.query.verified,
    availableNow: req.query.availableNow,
    enabled: req.query.enabled,
    priceMin: req.query.priceMin,
    priceMax: req.query.priceMax,
  });

  try {
    let category = typeof req.query.category === 'string' ? req.query.category : '';

    // ✅ alias/compat: slugs abreviados o viejos de la app -> slug real en DB (seed)
    const CATEGORY_ALIASES: Record<string, string> = {
      // Informática y electrónica
      'aire-acond': 'climatizacion',
      'st-electronica': 'servicio-tecnico-electronica',
      'st-electrodom': 'servicio-tecnico-electrodomesticos',
      'st-informatica': 'servicio-tecnico-informatica',

      // Seguridad
      'camaras-alarmas': 'camaras-y-alarmas',
      'personal-seg': 'personal-de-seguridad',

      // Servicios
      'acompanante-ter': 'acompanante-terapeutico',
      'clases-part': 'clases-particulares',
      'paseador-perros': 'paseador-de-perros',
    };

    const rawCategory = category;
    category = CATEGORY_ALIASES[category] ?? category;

    if (rawCategory !== category) {
      dbg(debugSpecialists, '[GET /specialists/search][alias]', {
        rawCategory,
        mappedTo: category,
      });
    }

    const lat = Number(req.query.lat ?? NaN);
    const lng = Number(req.query.lng ?? NaN);
    const radiusKm = Number(req.query.radiusKm ?? 8);

    // Para auxilio vehicular no usamos el radio estándar del cliente
    // en la preselección geográfica. Hoy el alcance especial es 200 km.
    const preselectRadiusKm = category === 'auxilio-vehicular' ? 400 : radiusKm;

    console.log('[GET /specialists/search][effective-radius]', {
      category,
      requestRadiusKm: radiusKm,
      preselectRadiusKm,
    });

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ ok: false, error: 'lat/lng requeridos' });
    }

    // filtros
    const enabledParam = typeof req.query.enabled === 'string' ? req.query.enabled : undefined;
    const onlyEnabled = enabledParam === 'true';

    const verifiedParam = typeof req.query.verified === 'string' ? req.query.verified : undefined;

    // ✅ default: true (solo verificados), salvo que manden verified=false explícitamente
    const verifiedFilter: boolean = verifiedParam !== 'false';

    const availableNowParam =
      typeof req.query.availableNow === 'string' ? req.query.availableNow : undefined;
    const onlyAvailable = availableNowParam === 'true';

    const priceMax = req.query.priceMax ? Number(req.query.priceMax) : undefined;
    const priceMin = req.query.priceMin ? Number(req.query.priceMin) : undefined;

    const sort = (req.query.sort as string) ?? 'distance';
    const debug = req.query.debug === 'true';

    const deg = preselectRadiusKm / 111;
    const latMin = lat - deg;
    const latMax = lat + deg;
    const lngMin = lng - deg;
    const lngMax = lng + deg;

    const visitPriceFilter =
      priceMin != null || priceMax != null
        ? { gte: priceMin ?? undefined, lte: priceMax ?? undefined }
        : undefined;

    logSearchStep(searchStartedAt, 'parsed_input', {
      category,
      verifiedFilter,
      onlyEnabled,
      onlyAvailable,
      radiusKm,
      preselectRadiusKm,
    });

    // 1) preselección rápida
    const pre = await prisma.specialistSearchIndex.findMany({
      where: {
        categorySlugs: category ? { has: category } : undefined,
        centerLat: { gte: latMin, lte: latMax },
        centerLng: { gte: lngMin, lte: lngMax },
        ...(verifiedFilter !== undefined ? { verified: verifiedFilter } : {}),
        ...(visitPriceFilter ? { visitPrice: visitPriceFilter } : {}),
      },
      take: 80,
    });

    console.log('[GET /specialists/search][pre-count]', {
      category,
      preselectRadiusKm,
      preCount: pre.length,
    });

    logSearchStep(searchStartedAt, 'after_preselect', {
      preCount: pre.length,
    });

    // 2) distancia + filtro por radio propio
    const toRad = (x: number) => (x * Math.PI) / 180;
    const withDist = pre
      .map((r) => {
        if (r.centerLat == null || r.centerLng == null)
          return { ...r, distanceKm: Number.POSITIVE_INFINITY };
        const R = 6371;
        const dLat = toRad(r.centerLat - lat);
        const dLng = toRad(r.centerLng - lng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat)) * Math.cos(toRad(r.centerLat)) * Math.sin(dLng / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(a));
        return { ...r, distanceKm: dist };
      })
      .filter((x) => x.distanceKm <= (x.radiusKm ?? radiusKm));

    logSearchStep(searchStartedAt, 'after_distance_filter', {
      withDistCount: withDist.length,
    });

    if (withDist.length === 0) {
      logSearchStep(searchStartedAt, 'return_empty_after_distance');
      return res.json([]);
    }

    // 3) enriquecer con datos reales del profile (incluye availability)
    const profilesQueryStartedAt = Date.now();

    const profiles = await prisma.specialistProfile.findMany({
      where: { id: { in: withDist.map((x) => x.specialistId) } },
      select: {
        id: true,
        userId: true,
        kycStatus: true,
        specialtyHeadline: true,
        avatarUrl: true,
        businessName: true,
        availability: true,
        availableNow: true,
        pricingLabel: true,
        visitPrice: true,
        ratingAvg: true,
        ratingCount: true,
        badge: true,
        backgroundCheck: { select: { status: true } },
        user: {
          select: {
            status: true,
            name: true,
            surname: true,
          },
        },
        serviceModes: true,
        officeAddressId: true,
      },
    });

    const profilesQueryMs = Date.now() - profilesQueryStartedAt;

    const profById = new Map(profiles.map((p) => [p.id, p]));

    logSearchStep(searchStartedAt, 'after_profiles_and_users', {
      profilesCount: profiles.length,
      usersCount: profiles.length,
      profilesQueryMs,
    });
    // 3.5) Habilitación por rubro (certificación) + info para UI
    const enabledBySpecialistId = new Map<string, boolean>();
    const certStatusBySpecialistId = new Map<string, 'PENDING' | 'APPROVED' | 'REJECTED' | null>();

    let requiresCertificationForCategory = false;
    let certsQueryMs = 0;

    if (category) {
      const cat = await prisma.serviceCategory.findUnique({
        where: { slug: category },
        select: { id: true, requiresCertification: true },
      });

      requiresCertificationForCategory = cat?.requiresCertification ?? false;

      // Si NO requiere certificación => todos habilitados por rubro
      if (!requiresCertificationForCategory) {
        for (const x of withDist) {
          enabledBySpecialistId.set(x.specialistId, true);
          certStatusBySpecialistId.set(x.specialistId, null);
        }
      } else if (cat?.id) {
        // Traer el estado de cert (no solo APPROVED) para cada especialista de ese rubro
        const certsQueryStartedAt = Date.now();

        const certs = await prisma.specialistCertification.findMany({
          where: {
            specialistId: { in: withDist.map((x) => x.specialistId) },
            categoryId: cat.id,
          },
          select: { specialistId: true, status: true },
        });

        certsQueryMs = Date.now() - certsQueryStartedAt;

        for (const c of certs) {
          const st = c.status as any as 'PENDING' | 'APPROVED' | 'REJECTED';
          certStatusBySpecialistId.set(c.specialistId, st);
          enabledBySpecialistId.set(c.specialistId, st === 'APPROVED');
        }

        // Los que no tienen cert cargada => quedan PENDING/null y enabled false
        for (const x of withDist) {
          if (!certStatusBySpecialistId.has(x.specialistId))
            certStatusBySpecialistId.set(x.specialistId, null);
          if (!enabledBySpecialistId.has(x.specialistId))
            enabledBySpecialistId.set(x.specialistId, false);
        }
      }

      logSearchStep(searchStartedAt, 'after_category_certifications', {
        requiresCertificationForCategory,
        specialistsConsidered: withDist.length,
        certStatusesLoaded: certStatusBySpecialistId.size,
        certsQueryMs: typeof certsQueryMs === 'number' ? certsQueryMs : 0,
      });
    }

    // ✅ cache por request para evitar N llamadas repetidas a canSpecialistBeVisible
    const gateStartedAt = Date.now();
    const subscriptionsQueryStartedAt = Date.now();

    const subscriptions = await prisma.subscription.findMany({
      where: {
        specialistId: { in: profiles.map((p) => p.id) },
      },
      select: {
        specialistId: true,
        status: true,
        trialEnd: true,
        currentPeriodEnd: true,
      },
    });

    const subscriptionsQueryMs = Date.now() - subscriptionsQueryStartedAt;

    const subscriptionBySpecialistId = new Map(subscriptions.map((s) => [s.specialistId, s]));

    const gateBySpecialistId = new Map<
      string,
      {
        ok: boolean;
        status?: string | null;
        reason?: 'NO_SPECIALIST_PROFILE' | 'SUBSCRIPTION_REQUIRED';
      }
    >();

    for (const profile of profiles) {
      const sub = subscriptionBySpecialistId.get(profile.id);
      gateBySpecialistId.set(profile.id, resolveSubscriptionGateFromData(sub));
    }

    const gateCalls = withDist.length;
    const gateCacheHits = 0;
    const gateDbCalls = subscriptions.length;
    const gateTotalMs = Date.now() - gateStartedAt;

    const activeOrdersQueryStartedAt = Date.now();

    const activeOrdersGrouped = await prisma.serviceOrder.groupBy({
      by: ['specialistId'],
      where: {
        specialistId: { in: withDist.map((x) => x.specialistId) },
        status: { in: [...SPECIALIST_SATURATION_STATUSES] as any },
      },
      _count: {
        specialistId: true,
      },
    });

    const activeOrdersQueryMs = Date.now() - activeOrdersQueryStartedAt;

    const activeOrdersBySpecialistId = new Map(
      activeOrdersGrouped.map((row) => [row.specialistId as string, row._count.specialistId]),
    );

    logSearchStep(searchStartedAt, 'after_active_orders_group', {
      activeOrdersGroupedCount: activeOrdersGrouped.length,
      activeOrdersQueryMs,
    });

    // 4) construir lista final + disponibilidad REAL (toggle + horario)
    let enriched = await Promise.all(
      withDist.map(async (x) => {
        const prof = profById.get(x.specialistId);
        const user = prof?.user;

        // ✅ 1) userOk viene del profile.user.status (ya lo traés en select)
        const userOk = prof?.user?.status !== 'BLOCKED';

        // ✅ 2) disponibilidad real
        const kycOk = prof?.kycStatus === 'VERIFIED';
        const requiresBackgroundCheck = requiresBackgroundCheckByServiceModes(prof?.serviceModes);
        const bgApproved = prof?.backgroundCheck?.status === 'APPROVED';
        const bgOk = requiresBackgroundCheck ? bgApproved : true;

        const toggleAvailable = userOk && kycOk && bgOk ? !!prof?.availableNow : false;
        const scheduleOk = isWithinAvailability(prof?.availability);

        const gate = prof
          ? (gateBySpecialistId.get(prof.id) ?? { ok: false, status: null })
          : { ok: false, status: null };
        const subOk = gate.ok;

        const activeJobsCount = activeOrdersBySpecialistId.get(x.specialistId) ?? 0;
        const underCapacity = activeJobsCount < MAX_ACTIVE_ORDERS_SPECIALIST;

        const visible = userOk && kycOk && bgOk && subOk && toggleAvailable && underCapacity; // ⬅️ NO incluye horario
        const availableNow = visible && scheduleOk; // ⬅️ SOLO para la pill

        const personalName = `${user?.name ?? 'Especialista'} ${user?.surname ?? ''}`.trim();
        const name = prof?.businessName?.trim() ? prof.businessName.trim() : personalName;

        const debugInfo = debug
          ? {
              _debug: {
                userOk,
                kycOk,
                bgOk,
                toggleAvailable,
                scheduleOk,
                availability: prof?.availability ?? null,
                serverNowISO: new Date().toISOString(),
                serverNowLocal: new Intl.DateTimeFormat('es-AR', {
                  timeZone: 'America/Argentina/Cordoba',
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                }).format(new Date()),
                tz: 'America/Argentina/Cordoba',
              },
            }
          : {};

        const certStatus = category ? (certStatusBySpecialistId.get(x.specialistId) ?? null) : null;
        const categoryEnabled = category
          ? enabledBySpecialistId.get(x.specialistId) === true
          : true;

        return {
          ...x,
          ...debugInfo,

          // ✅ campo para filtrar
          userOk,

          name,
          ratingAvg: prof?.ratingAvg ?? 0,
          ratingCount: prof?.ratingCount ?? 0,
          visitPrice: prof?.visitPrice ?? x.visitPrice ?? null,
          badge: prof?.badge ?? x.badge ?? null,

          // 👇 compat (hasta que el mobile use categoryEnabled)
          enabled: categoryEnabled,

          // 👇 nuevos campos para dejarlo perfecto
          requiresCertification: category ? requiresCertificationForCategory : false,
          certStatus,
          categoryEnabled,

          kycStatus: prof?.kycStatus ?? 'UNVERIFIED',
          avatarUrl: prof?.avatarUrl ?? null,
          serviceModes:
            Array.isArray((prof as any)?.serviceModes) && (prof as any).serviceModes.length
              ? (prof as any).serviceModes
              : ['HOME'],
          serviceModesConfigured: hasExplicitServiceModes(prof?.serviceModes),
          requiresBackgroundCheck,
          backgroundCheckApproved: !!bgApproved,
          officeAddressId: (prof as any)?.officeAddressId ?? null,
          visible,
          availableNow, // pill (incluye horario)
          activeJobsCount,
          atCapacity: !underCapacity,
          pricingLabel: prof?.pricingLabel ?? null,
          specialtyHeadline: (prof as any)?.specialtyHeadline ?? null,
        };
      }),
    );

    logSearchStep(searchStartedAt, 'after_enrichment', {
      enrichedCountBeforeVisibleFilter: enriched.length,
      gateCalls,
      gateCacheHits,
      gateDbCalls,
      gateTotalMs,
      gateAvgMs: gateDbCalls > 0 ? Math.round(gateTotalMs / gateDbCalls) : 0,
    });

    enriched = enriched.filter((x) => x.userOk !== false && x.visible === true);

    logSearchStep(searchStartedAt, 'after_visible_filter', {
      enrichedCountAfterVisibleFilter: enriched.length,
    });

    logSearchStep(searchStartedAt, 'gate_summary', {
      gateCalls,
      gateCacheHits,
      gateDbCalls,
      gateTotalMs,
      gateAvgMs: gateDbCalls > 0 ? Math.round(gateTotalMs / gateDbCalls) : 0,
      subscriptionsQueryMs,
      mode: 'batched_by_specialistId',
    });
    if (onlyAvailable) enriched = enriched.filter((x) => x.availableNow === true);
    if (onlyEnabled) enriched = enriched.filter((x) => x.enabled === true);

    logSearchStep(searchStartedAt, 'after_final_filters', {
      onlyAvailable,
      onlyEnabled,
      finalCountBeforeSort: enriched.length,
    });

    if (sort === 'rating') {
      enriched.sort(
        (a, b) =>
          (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) ||
          (b.ratingCount ?? 0) - (a.ratingCount ?? 0) ||
          a.distanceKm - b.distanceKm,
      );
    } else if (sort === 'price') {
      enriched.sort((a, b) => (a.visitPrice ?? Infinity) - (b.visitPrice ?? Infinity));
    } else {
      enriched.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    const finalItems = enriched.slice(0, 50);

    logSearchStep(searchStartedAt, 'response_ready', {
      finalCount: finalItems.length,
    });

    return res.json(finalItems);
  } catch (e) {
    logSearchStep(searchStartedAt, 'error');
    if (process.env.NODE_ENV !== 'production') console.error('GET /specialists/search', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * GET /specialists/by-category/:slug
 */
router.get('/by-category/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug ?? '')
      .trim()
      .toLowerCase();
    if (!slug) return res.status(400).json({ ok: false, error: 'slug_required' });

    const rows = await prisma.specialistSpecialty.findMany({
      where: {
        category: { slug },
        specialist: { kycStatus: { in: ['PENDING', 'VERIFIED'] } },
      },
      select: {
        specialist: {
          select: {
            id: true,
            bio: true,
            radiusKm: true,
            visitPrice: true,
            pricingLabel: true, // ✅ NUEVO (no rompe)
            kycStatus: true,
            avatarUrl: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    const data = rows.map((r) => ({
      id: r.specialist.id,
      name: r.specialist.user?.name ?? 'Especialista',
      bio: r.specialist.bio ?? '',
      radiusKm: r.specialist.radiusKm,
      visitPrice: r.specialist.visitPrice,
      pricingLabel: r.specialist.pricingLabel ?? null, // ✅ NUEVO
      kycStatus: r.specialist.kycStatus,
      avatarUrl: r.specialist.avatarUrl ?? null,
    }));

    return res.json({ ok: true, count: data.length, specialists: data });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('GET /specialists/by-category/:slug', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* ─────────────────────────────────────────────────────────────────────
 * RUTAS PRIVADAS (auth)
 * ────────────────────────────────────────────────────────────────────*/

/** POST /specialists/background-check/upload */
router.post('/background-check/upload', auth, (req: Request, res: Response) => {
  uploadBackgroundCheck.single('file')(req, res, async (err: any) => {
    const maybe = multerErrorToResponse(err, res);
    if (maybe) return;

    const r = req as MulterReq;

    try {
      if (!r.file) {
        return res.status(400).json({ ok: false, error: 'file_required' });
      }

      const relative = `/uploads/background-checks/${path.basename(r.file.path)}`;

      return res.json({
        ok: true,
        url: relative,
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('POST /specialists/background-check/upload', e);
      }
      return res.status(500).json({ ok: false, error: 'server_error' });
    }
  });
});

/** POST /specialists/background-check (upsert 1 por especialista) */
router.post('/background-check', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const schema = z.object({
      fileUrl: urlLike, // viene del upload
    });

    const body = schema.parse(req.body);

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

    const created = await prisma.specialistBackgroundCheck.upsert({
      where: { specialistId: spec.id },
      create: {
        specialistId: spec.id,
        fileUrl: body.fileUrl,
        status: 'PENDING',
      },
      update: {
        fileUrl: body.fileUrl,
        status: 'PENDING',
        rejectionReason: null,
        reviewerId: null,
        reviewedAt: null,
      },
      select: { id: true, status: true, fileUrl: true },
    });

    try {
      await notifyBackgroundCheckStatus({
        userId,
        status: 'PENDING',
        backgroundCheckId: created.id,
        fileUrl: created.fileUrl, // ✅ CLAVE
        alsoNotifyAdmins: true,
      });
    } catch (e) {
      console.warn('[specialists] notifyBackgroundCheckStatus PENDING failed', e);
    }

    // opcional: refrescar search index (por si después lo usás para filtros)
    await syncSearchIndexForUser(userId);

    return res.json({
      ok: true,
      backgroundCheck: { ...created, fileUrl: toAbsoluteUrl(created.fileUrl) },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production')
      console.error('POST /specialists/background-check', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** GET /specialists/background-check (estado actual) */
router.get('/background-check', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!spec) return res.json({ ok: true, backgroundCheck: null });

    const bg = await prisma.specialistBackgroundCheck.findUnique({
      where: { specialistId: spec.id },
      select: {
        id: true,
        fileUrl: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
      },
    });

    if (!bg) return res.json({ ok: true, backgroundCheck: null });

    return res.json({
      ok: true,
      backgroundCheck: {
        ...bg,
        fileUrl: toAbsoluteUrl(bg.fileUrl),
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('GET /specialists/background-check', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** POST /specialists/kyc/upload */
router.post('/kyc/upload', auth, (req: Request, res: Response) => {
  upload.single('file')(req, res, async (err: any) => {
    const maybe = multerErrorToResponse(err, res);
    if (maybe) return;

    const r = req as MulterReq;

    try {
      if (!r.file) return res.status(400).json({ ok: false, error: 'file_required' });

      const mime = String(r.file.mimetype ?? '').toLowerCase();

      console.log('[POST /specialists/kyc/upload]', {
        hasFile: !!r.file,
        originalname: r.file?.originalname ?? null,
        mimetype: r.file?.mimetype ?? null,
        size: r.file?.size ?? null,
      });

      // ✅ HEIC/HEIF: no pasar por sharp para no romper producción en Render
      if (isHeicLike(mime)) {
        const relative = `/uploads/kyc/${path.basename(r.file.path)}`;

        return res.json({
          ok: true,
          url: relative,
          format: path.extname(r.file.path).replace('.', '').toLowerCase() || 'heic',
          width: null,
          height: null,
          optimized: false,
        });
      }

      // ✅ Flujo actual intacto para Android / imágenes estándar
      if (!isStandardProcessableImage(mime)) {
        try {
          fs.unlinkSync(r.file.path);
        } catch {}
        return res.status(415).json({ ok: false, error: 'unsupported_type' });
      }

      const minW = 400;
      const minH = 500;

      const meta = await sharp(r.file.path, {
        limitInputPixels: SHARP_LIMIT_INPUT_PIXELS,
      })
        .rotate()
        .metadata();

      console.log('[POST /specialists/kyc/upload][meta]', {
        originalname: r.file.originalname,
        mimetype: r.file.mimetype,
        width: meta.width ?? null,
        height: meta.height ?? null,
        format: meta.format ?? null,
      });

      if (!meta.width || !meta.height || meta.width < minW || meta.height < minH) {
        console.log('[POST /specialists/kyc/upload][low_quality]', {
          originalname: r.file.originalname,
          width: meta.width ?? null,
          height: meta.height ?? null,
          minW,
          minH,
        });

        try {
          fs.unlinkSync(r.file.path);
        } catch {}

        return res.status(400).json({
          ok: false,
          error: 'low_quality',
          minW,
          minH,
          width: meta.width ?? null,
          height: meta.height ?? null,
        });
      }

      const webpPath = r.file.path + '.webp';

      console.log('[POST /specialists/kyc/upload][convert_start]', {
        originalname: r.file.originalname,
        inputPath: r.file.path,
        outputPath: webpPath,
      });

      await sharp(r.file.path, {
        limitInputPixels: SHARP_LIMIT_INPUT_PIXELS,
      })
        .rotate()
        .resize({
          width: KYC_MAX_OUTPUT_WIDTH,
          height: KYC_MAX_OUTPUT_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toFile(webpPath);

      console.log('[POST /specialists/kyc/upload][convert_ok]', {
        originalname: r.file.originalname,
        outputPath: webpPath,
      });

      try {
        fs.unlinkSync(r.file.path);
      } catch {}

      const relative = `/uploads/kyc/${path.basename(webpPath)}`;

      return res.json({
        ok: true,
        url: relative,
        width: meta.width,
        height: meta.height,
        format: 'webp',
        optimized: true,
      });
    } catch (e: any) {
      console.error('[POST /specialists/kyc/upload][catch]', {
        message: e?.message ?? 'unknown_error',
        stack: e?.stack ?? null,
        originalname: r.file?.originalname ?? null,
        mimetype: r.file?.mimetype ?? null,
        size: r.file?.size ?? null,
        path: r.file?.path ?? null,
      });

      return res.status(500).json({
        ok: false,
        error: 'server_error',
        message: e?.message ?? 'unknown_error',
      });
    }
  });
});

/** POST /specialists/kyc/submit (IDEMPOTENTE) */
router.post('/kyc/submit', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const schema = z.object({
      dniFrontUrl: urlLike,
      dniBackUrl: urlLike,
      selfieUrl: urlLike,
    });

    const body = schema.parse(req.body);

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

    // ✅ IMPORTANTÍSIMO: cuando el especialista reenvía KYC, el profile vuelve a PENDING
    await prisma.specialistProfile.update({
      where: { id: spec.id },
      data: {
        kycStatus: 'PENDING',
        availableNow: false,
      },
    });

    // ✅ 1) si ya hay una submission PENDING, devolvemos esa (idempotencia)
    const existing = await prisma.kycSubmission.findFirst({
      where: { specialistId: spec.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, dniFrontUrl: true, dniBackUrl: true, selfieUrl: true },
    });

    if (existing) {
      const updated = await prisma.kycSubmission.update({
        where: { id: existing.id },
        data: {
          dniFrontUrl: toAbsoluteUrl(body.dniFrontUrl),
          dniBackUrl: toAbsoluteUrl(body.dniBackUrl),
          selfieUrl: toAbsoluteUrl(body.selfieUrl),
          rejectionReason: null,
          reviewerId: null,
          reviewedAt: null,
        },
        select: { id: true, status: true, dniFrontUrl: true, dniBackUrl: true, selfieUrl: true },
      });

      return res.json({ ok: true, submission: updated, reused: true });
    }

    // ✅ 2) si no existe, creamos
    const created = await prisma.kycSubmission.create({
      data: {
        specialistId: spec.id,
        dniFrontUrl: toAbsoluteUrl(body.dniFrontUrl),
        dniBackUrl: toAbsoluteUrl(body.dniBackUrl),
        selfieUrl: toAbsoluteUrl(body.selfieUrl),
        status: 'PENDING',
      },
      select: { id: true, status: true, dniFrontUrl: true, dniBackUrl: true, selfieUrl: true },
    });

    // notificación (solo al crear)
    await notifyKycStatus({ userId, status: 'PENDING', submissionId: created.id });

    return res.json({ ok: true, submission: created, reused: false });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production') console.error('POST /specialists/kyc/submit', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** POST /specialists/register */
router.post('/register', auth, async (req: AuthReq, res: Response) => {
  const t0 = Date.now();
  console.log(`[spec/register] t0 start userId=${req.user?.id}`);

  try {
    const schema = z.object({
      specialties: z.array(z.string().min(1)).min(1),

      // ✅ NUEVO: obligatorio en registro, sin default
      serviceModes: z.array(z.enum(['HOME', 'OFFICE', 'ONLINE'])).min(1),

      // ✅ NUEVO: requerido solo si viene OFFICE
      officeAddress: OfficeAddressSchema.nullable().optional(),

      visitPrice: z.coerce.number().int().nonnegative().optional(),
      radiusKm: z.coerce.number().int().min(1).max(200).optional(),
      pricingLabel: z.string().max(40).optional().nullable(),
      availability: z.any().optional(),
      bio: z.string().optional().default(''),
      kyc: z.object({
        dniFrontUrl: urlLike,
        dniBackUrl: urlLike,
        selfieUrl: urlLike,
      }),
    });

    const data = schema.parse(req.body);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const kycAbs = {
      dniFrontUrl: toAbsoluteUrl(data.kyc.dniFrontUrl),
      dniBackUrl: toAbsoluteUrl(data.kyc.dniBackUrl),
      selfieUrl: toAbsoluteUrl(data.kyc.selfieUrl),
    };

    // ✅ NUEVO: perfil actual para reutilizar officeAddress si ya existe
    const existingProfile = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { officeAddressId: true },
    });

    // ✅ NUEVO: resolver modalidades + dirección de oficina/local
    let nextOfficeAddressId: string | null = null;

    const includesOffice = data.serviceModes.includes('OFFICE');

    if (includesOffice) {
      if (!data.officeAddress) {
        return res.status(400).json({ ok: false, error: 'office_address_required' });
      }

      const officeAddress = data.officeAddress;

      let formatted = String(officeAddress.formatted ?? '').trim();
      if (!formatted) {
        return res.status(400).json({ ok: false, error: 'office_address_required' });
      }

      let lat = officeAddress.lat;
      let lng = officeAddress.lng;
      let inferredLocality: string | null = null;

      // Si no vienen coords, geocodificamos con fallback
      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        try {
          const result = await geocodeOfficeAddressWithFallback({
            formatted,
            locality: officeAddress.locality ?? null,
          });

          inferredLocality = result.inferredLocality;
          formatted = result.usedFormatted;

          dbg(debugSpecialists, '[POST /specialists/register] geocode input', {
            originalFormatted: result.originalFormatted,
            normalizedFormatted: result.usedFormatted,
            locality: officeAddress.locality ?? null,
            inferredLocality,
          });

          dbg(debugSpecialists, '[POST /specialists/register] geocode result', {
            normalizedFormatted: result.usedFormatted,
            geo: result.geo,
          });

          lat = result.geo?.lat;
          lng = result.geo?.lng;
        } catch (e) {
          dbg(debugSpecialists, '[POST /specialists/register] geocodeAddress failed', {
            originalFormatted: officeAddress.formatted,
            normalizedFormatted: formatted,
            locality: officeAddress.locality ?? null,
            error: e instanceof Error ? { message: e.message, stack: e.stack } : e,
          });

          return res.status(400).json({
            ok: false,
            error: 'office_geocode_failed',
            message:
              'No pudimos ubicar esa dirección. Revisá que la calle esté bien escrita y agregá altura, barrio o una referencia.',
          });
        }

        if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
          return res.status(400).json({
            ok: false,
            error: 'office_geocode_failed',
            message:
              'No pudimos ubicar esa dirección. Revisá que la calle esté bien escrita y agregá altura, barrio o una referencia.',
          });
        }
      }

      // Córdoba-only, igual que PATCH /me
      const inCordoba = lat >= -35.5 && lat <= -29.0 && lng >= -66.8 && lng <= -62.0;
      if (!inCordoba) {
        return res.status(400).json({
          ok: false,
          error: 'office_coords_outside_cordoba',
          message:
            'La dirección encontrada quedó fuera de Córdoba. Revisá la calle y la localidad ingresadas.',
        });
      }

      if (existingProfile?.officeAddressId) {
        const updatedAddress = await prisma.address.update({
          where: { id: existingProfile.officeAddressId },
          data: {
            placeId: officeAddress.placeId ?? null,
            formatted,
            lat,
            lng,
          },
          select: { id: true },
        });

        nextOfficeAddressId = updatedAddress.id;
      } else {
        const createdAddress = await prisma.address.create({
          data: {
            placeId: officeAddress.placeId ?? null,
            formatted,
            lat,
            lng,
          },
          select: { id: true },
        });

        nextOfficeAddressId = createdAddress.id;
      }
    }

    // 1) upsert profile
    const specialist = await prisma.specialistProfile.upsert({
      where: { userId },
      update: {
        ...(data.visitPrice !== undefined ? { visitPrice: data.visitPrice } : {}),
        ...(data.radiusKm !== undefined ? { radiusKm: data.radiusKm } : {}),
        ...(data.pricingLabel !== undefined ? { pricingLabel: data.pricingLabel } : {}),
        ...(data.availability !== undefined ? { availability: data.availability as any } : {}),
        bio: data.bio,
        kycStatus: 'PENDING',
        availableNow: false,
        serviceModes: data.serviceModes as any,
        officeAddressId: nextOfficeAddressId,
      },
      create: {
        userId,
        visitPrice: data.visitPrice ?? null,
        radiusKm: data.radiusKm ?? null,
        pricingLabel: data.pricingLabel ?? null,
        availability: (data.availability as any) ?? null,
        bio: data.bio,
        kycStatus: 'PENDING',
        availableNow: false,
        serviceModes: data.serviceModes as any,
        officeAddressId: nextOfficeAddressId,
      },
      select: { id: true },
    });
    console.log(`[spec/register] t1 after_profile ms=${Date.now() - t0}`);

    // 2) specialties
    await prisma.specialistSpecialty.deleteMany({ where: { specialistId: specialist.id } });

    const cats = await prisma.serviceCategory.findMany({
      where: { slug: { in: data.specialties } },
      select: { id: true },
    });
    if (cats.length === 0) {
      return res.status(400).json({ ok: false, error: 'invalid_specialties' });
    }

    await prisma.specialistSpecialty.createMany({
      data: cats.map((c) => ({ specialistId: specialist.id, categoryId: c.id })),
      skipDuplicates: true,
    });

    // 3) kyc submission (idempotente: si ya existe PENDING, reusar)
    const existing = await prisma.kycSubmission.findFirst({
      where: { specialistId: specialist.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const submission = existing
      ? existing
      : await prisma.kycSubmission.create({
          data: {
            specialistId: specialist.id,
            dniFrontUrl: kycAbs.dniFrontUrl,
            dniBackUrl: kycAbs.dniBackUrl,
            selfieUrl: kycAbs.selfieUrl,
            status: 'PENDING',
          },
          select: { id: true },
        });

    if (!existing) {
      await notifyKycStatus({ userId, status: 'PENDING', submissionId: submission.id });
    }

    console.log(`[spec/register] t2 after_specialties_kyc ms=${Date.now() - t0}`);

    // ✅ 4) IMPORTANTÍSIMO: asegurar rol SPECIALIST + token nuevo
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: 'SPECIALIST' },
      select: { id: true, role: true, email: true, name: true, surname: true, phone: true },
    });

    const token = signToken({ sub: updatedUser.id, role: updatedUser.role });

    // 5) asegurar suscripción/trial inicial
    await getOrCreateSubscriptionForSpecialist(userId);
    console.log(`[spec/register] t3 after_subscription_init ms=${Date.now() - t0}`);

    // 6) sync index
    await syncSearchIndexForUser(userId);
    console.log(`[spec/register] t4 after_search_index ms=${Date.now() - t0}`);

    console.log(`[spec/register] tEnd total_ms=${Date.now() - t0}`);

    return res.json({
      ok: true,
      specialistId: specialist.id,
      user: updatedUser,
      token,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production') console.error('POST /specialists/register', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** helpers PATCH /me */
function pickBadge(avg: number | null, count: number | null): 'BRONZE' | 'SILVER' | 'GOLD' | null {
  if (!avg || !count) return null;
  if (count >= 100 && avg >= 4.8) return 'GOLD';
  if (count >= 20 && avg >= 4.5) return 'SILVER';
  return 'BRONZE';
}

function normalizeOfficeAddressText(input: string): string {
  let s = String(input ?? '').trim();

  if (!s) return s;

  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/\s+/g, ' ').trim();

  const replacements: [RegExp, string][] = [
    [/\b(pje|pje\.)\s+/gi, 'pasaje '],
    [/\b(pas|pas\.)\s+/gi, 'pasaje '],
    [/\b(psje|psje\.)\s+/gi, 'pasaje '],
    [/\b(av|av\.)\s+/gi, 'avenida '],
    [/\b(avda|avda\.)\s+/gi, 'avenida '],
    [/\b(bv|bv\.)\s+/gi, 'boulevard '],
    [/\b(blvd|blvd\.)\s+/gi, 'boulevard '],
    [/\b(gral|gral\.)\s+/gi, 'general '],
    [/\b(dr|dr\.)\s+/gi, 'doctor '],
  ];

  for (const [regex, value] of replacements) {
    s = s.replace(regex, value);
  }

  // limpia puntos internos raros pero conserva comas
  s = s.replace(/\.(?=[A-Za-zÁÉÍÓÚáéíóúÑñ])/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*,\s*/g, ', ');

  // capitalización simple palabra por palabra
  s = s
    .split(',')
    .map((part) =>
      part
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
    )
    .join(', ');

  return s;
}

function normalizeLooseAddress(input: string): string {
  let s = String(input ?? '').trim();

  if (!s) return s;

  // normaliza formas comunes de numeración
  s = s.replace(/\b(n[°ºo]\.?|numero)\s*/gi, ' ');

  // normaliza separadores y espacios
  s = s.replace(/\s*-\s*/g, ' ');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*,\s*/g, ', ');

  return s.trim();
}

function deaccent(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function stripStreetNumber(input: string): string {
  return String(input ?? '')
    .replace(/\s+\d+[A-Za-z]?(?:\s*(?:bis|BIS))?\s*$/i, '')
    .trim();
}

async function geocodeOfficeAddressWithFallback(params: {
  formatted: string;
  locality?: string | null;
}) {
  const originalFormatted = String(params.formatted ?? '').trim();
  const explicitLocality = String(params.locality ?? '').trim() || null;

  const parts = originalFormatted
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const streetPart = String(parts[0] ?? '').trim();
  const inferredLocality = explicitLocality || String(parts[1] ?? '').trim() || null;

  const candidates = new Set<string>();

  const pushCandidate = (value?: string | null) => {
    const v = String(value ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();

    if (v) candidates.add(v);
  };

  const normalizedOriginal = normalizeOfficeAddressText(originalFormatted);
  const normalizedStreet = normalizeOfficeAddressText(streetPart);
  const normalizedLocality = inferredLocality ? normalizeOfficeAddressText(inferredLocality) : null;
  const looseOriginal = normalizeLooseAddress(normalizedOriginal || originalFormatted);
  const looseStreet = normalizeLooseAddress(normalizedStreet || streetPart);
  const looseLocality = normalizedLocality ? normalizeLooseAddress(normalizedLocality) : null;
  const streetWithoutPrefix = normalizedStreet.replace(
    /^(pasaje|avenida|boulevard|general|doctor)\s+/i,
    '',
  );

  const streetWithoutNumber = stripStreetNumber(normalizedStreet);
  const streetWithoutPrefixAndNumber = stripStreetNumber(streetWithoutPrefix);

  // 1) exacta
  pushCandidate(originalFormatted);
  pushCandidate(looseOriginal);

  // 2) normalizada completa
  if (normalizedOriginal && normalizedOriginal !== originalFormatted) {
    pushCandidate(normalizedOriginal);
  }

  if (
    looseOriginal &&
    looseOriginal !== normalizedOriginal &&
    looseOriginal !== originalFormatted
  ) {
    pushCandidate(looseOriginal);
  }

  // 3) variantes con localidad
  if (streetPart && inferredLocality) {
    pushCandidate(`${streetPart}, ${inferredLocality}, Córdoba, Argentina`);
    pushCandidate(`${normalizedStreet}, ${inferredLocality}, Córdoba, Argentina`);

    pushCandidate(`${looseStreet}, ${inferredLocality}, Córdoba, Argentina`);

    if (looseLocality) {
      pushCandidate(`${looseStreet}, ${looseLocality}, Córdoba, Argentina`);
    }
    if (normalizedLocality && normalizedLocality !== inferredLocality) {
      pushCandidate(`${streetPart}, ${normalizedLocality}, Córdoba, Argentina`);
      pushCandidate(`${normalizedStreet}, ${normalizedLocality}, Córdoba, Argentina`);
    }

    // sin prefijo
    if (streetWithoutPrefix && streetWithoutPrefix !== normalizedStreet) {
      pushCandidate(`${streetWithoutPrefix}, ${inferredLocality}, Córdoba, Argentina`);
      if (normalizedLocality) {
        pushCandidate(`${streetWithoutPrefix}, ${normalizedLocality}, Córdoba, Argentina`);
      }
    }

    // ✅ sin altura
    if (streetWithoutNumber && streetWithoutNumber !== normalizedStreet) {
      pushCandidate(`${streetWithoutNumber}, ${inferredLocality}, Córdoba, Argentina`);
      pushCandidate(`${streetWithoutNumber}, ${inferredLocality}, Argentina`);

      if (normalizedLocality) {
        pushCandidate(`${streetWithoutNumber}, ${normalizedLocality}, Córdoba, Argentina`);
      }
    }

    // ✅ sin prefijo y sin altura
    if (
      streetWithoutPrefixAndNumber &&
      streetWithoutPrefixAndNumber !== streetWithoutPrefix &&
      streetWithoutPrefixAndNumber !== normalizedStreet
    ) {
      pushCandidate(`${streetWithoutPrefixAndNumber}, ${inferredLocality}, Córdoba, Argentina`);
      pushCandidate(`${streetWithoutPrefixAndNumber}, ${inferredLocality}, Argentina`);

      if (normalizedLocality) {
        pushCandidate(`${streetWithoutPrefixAndNumber}, ${normalizedLocality}, Córdoba, Argentina`);
      }
    }

    // variantes más cortas
    pushCandidate(`${streetPart}, ${inferredLocality}, Argentina`);
    pushCandidate(`${normalizedStreet}, ${inferredLocality}, Argentina`);

    pushCandidate(`${looseStreet}, ${inferredLocality}, Argentina`);

    if (looseLocality) {
      pushCandidate(`${looseStreet}, ${looseLocality}, Argentina`);
    }
    if (streetWithoutPrefix && streetWithoutPrefix !== normalizedStreet) {
      pushCandidate(`${streetWithoutPrefix}, ${inferredLocality}, Argentina`);
    }

    pushCandidate(`${streetPart}, ${inferredLocality}, Cordoba, Argentina`);
    pushCandidate(`${normalizedStreet}, ${inferredLocality}, Cordoba, Argentina`);

    // ✅ variantes sin localidad aunque exista
    pushCandidate(`${streetPart}, Córdoba, Argentina`);
    pushCandidate(`${normalizedStreet}, Córdoba, Argentina`);
    pushCandidate(`${looseStreet}, Córdoba, Argentina`);

    pushCandidate(`${streetPart}, Argentina`);
    pushCandidate(`${normalizedStreet}, Argentina`);
    pushCandidate(`${looseStreet}, Argentina`);

    // ✅ último fallback: calle sola
    pushCandidate(streetPart);
    pushCandidate(normalizedStreet);
    pushCandidate(looseStreet);
  }

  // 4) si no hubo localidad, recién ahí usamos variantes genéricas
  if (streetPart && !inferredLocality) {
    pushCandidate(`${streetPart}, Córdoba, Argentina`);
    pushCandidate(`${normalizedStreet}, Córdoba, Argentina`);

    if (streetWithoutPrefix && streetWithoutPrefix !== normalizedStreet) {
      pushCandidate(`${streetWithoutPrefix}, Córdoba, Argentina`);
    }

    if (streetWithoutNumber && streetWithoutNumber !== normalizedStreet) {
      pushCandidate(`${streetWithoutNumber}, Córdoba, Argentina`);
      pushCandidate(`${streetWithoutNumber}, Argentina`);
    }

    pushCandidate(`${streetPart}, Argentina`);
    pushCandidate(`${normalizedStreet}, Argentina`);
  }

  // 5) variantes sin tildes
  for (const c of Array.from(candidates)) {
    const deaccented = deaccent(c);
    if (deaccented !== c) pushCandidate(deaccented);
  }

  let geo: any = null;
  let usedFormatted = originalFormatted;

  const prioritizedCandidates = Array.from(candidates).slice(0, 4);

  dbg(debugSpecialists, '[geocodeOfficeAddressWithFallback] candidates', prioritizedCandidates);

  for (const candidate of prioritizedCandidates) {
    try {
      dbg(debugSpecialists, '[geocodeOfficeAddressWithFallback] trying candidate', {
        candidate,
      });

      const result = await geocodeAddress(candidate);

      dbg(debugSpecialists, '[geocodeOfficeAddressWithFallback] candidate result', {
        candidate,
        result,
      });

      if (
        result?.lat != null &&
        result?.lng != null &&
        !Number.isNaN(result.lat) &&
        !Number.isNaN(result.lng)
      ) {
        geo = result;
        usedFormatted = candidate;
        break;
      }
    } catch (e) {
      dbg(debugSpecialists, '[geocodeOfficeAddressWithFallback] candidate failed', {
        candidate,
        error: e instanceof Error ? { message: e.message, stack: e.stack } : e,
      });
    }
  }

  return {
    geo,
    usedFormatted,
    inferredLocality,
    originalFormatted,
  };
}

const AvailabilityRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const AvailabilitySchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  ranges: z.array(AvailabilityRangeSchema).min(1).max(2).optional(),
  mode: z.enum(['single', 'split', 'allday']).optional(),
  enabled: z.boolean().optional(),
});

const OfficeAddressSchema = z.preprocess(
  (v) => {
    // ✅ compat: si el mobile manda string, lo convertimos al objeto esperado
    if (typeof v === 'string') return { formatted: v };
    return v;
  },
  z.object({
    formatted: z.string().min(5),
    locality: z.string().min(2).optional().nullable(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    placeId: z.string().optional().nullable(),
  }),
);

const PatchMeSchema = z.object({
  businessName: z.string().trim().max(80).optional().nullable(),
  bio: z.string().max(1000).optional(),
  specialtyHeadline: z.string().max(60).optional().nullable(),
  available: z.boolean().optional(),
  radiusKm: z.coerce.number().int().min(0).max(200).optional(),
  visitPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),

  // ✅ NUEVO: etiqueta de forma de cobro
  pricingLabel: z.string().max(40).optional().nullable(),

  availability: AvailabilitySchema.partial().optional(),
  avatarUrl: z.union([urlLike, z.literal(null)]).optional(),
  centerLat: z.coerce.number().optional(),
  centerLng: z.coerce.number().optional(),

  // ✅ NUEVO: modos de servicio del especialista
  serviceModes: z
    .array(z.enum(['HOME', 'OFFICE', 'ONLINE']))
    .min(1)
    .optional(),

  // ✅ NUEVO: dirección de oficina (acepta string o objeto)
  officeAddress: OfficeAddressSchema.nullable().optional(),
});

/** GET /specialists/me */
router.get('/me', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const profile = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        businessName: true,
        bio: true,
        specialtyHeadline: true,
        availableNow: true,
        radiusKm: true,
        visitPrice: true,
        pricingLabel: true,
        availability: true,
        ratingAvg: true,
        ratingCount: true,
        badge: true,
        kycStatus: true,
        avatarUrl: true,
        centerLat: true,
        centerLng: true,

        // ✅ NUEVO:
        serviceModes: true,
        officeAddressId: true,
        officeAddress: {
          select: {
            id: true,
            formatted: true,
            lat: true,
            lng: true,
            placeId: true,
          },
        },

        user: { select: { name: true, surname: true } },
        specialties: { select: { category: { select: { slug: true } } } },

        backgroundCheck: {
          select: {
            status: true,
            reviewedAt: true,
            rejectionReason: true,
            fileUrl: true,
          },
        },
      },
    });

    if (!profile) {
      return res.json({
        ok: true,
        profile: {
          name: null,
          bio: '',
          available: false,
          availableNow: false,
          radiusKm: 30,
          visitPrice: 0,
          pricingLabel: null,
          serviceModes: ['HOME'],
          serviceModesConfigured: false,
          requiresBackgroundCheck: true,
          backgroundCheckApproved: false,
          officeAddressId: null,
          availability: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
          ratingAvg: null,
          ratingCount: null,
          badge: null,
          kycStatus: 'UNVERIFIED',
          kyc: null,
          specialties: [],
          avatarUrl: null,
          stats: { done: 0, canceled: 0 },
          centerLat: null,
          centerLng: null,
        },
      });
    }

    // ✅ Traer último envío de KYC (para UI: estado, motivo, fechas y urls)
    const lastKyc = await prisma.kycSubmission.findFirst({
      where: { specialistId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        rejectionReason: true,
        createdAt: true,
        reviewedAt: true,
        dniFrontUrl: true,
        dniBackUrl: true,
        selfieUrl: true,
      },
    });

    const avail = (profile.availability as any) || null;

    // ✅ disponibilidad real consistente (KYC + BG + horario + toggle + user ok)
    const safe = await computeSafeAvailability({
      userId,
      specialistId: profile.id,
      kycStatus: profile.kycStatus as any,
      availableNow: profile.availableNow,
      availability: avail,
    });

    const requiresBackgroundCheck = safe.requiresBackgroundCheck;
    const serviceModesConfigured = safe.serviceModesConfigured;
    const backgroundCheckApproved = safe.bgApproved;

    // 👉 visible real (para clientes)
    const available = safe.visibleNow;

    // 👉 toggle real (intención del user)
    // si no cumple requisitos (kyc/bg/user), lo mostramos false para evitar incoherencias
    const availableNow = safe.canToggle ? !!profile.availableNow : false;

    const ratingAvg = profile.ratingAvg ?? null;
    const ratingCount = profile.ratingCount ?? null;
    const badge = pickBadge(ratingAvg, ratingCount);

    const { done, canceled } = await getSpecialistStatsById(profile.id);

    return res.json({
      ok: true,
      profile: {
        name: `${profile.user?.name ?? ''} ${profile.user?.surname ?? ''}`.trim(),
        businessName: (profile as any).businessName ?? null,
        bio: profile.bio ?? '',
        specialtyHeadline: (profile as any).specialtyHeadline ?? null,
        available,
        availableNow,
        radiusKm: profile.radiusKm ?? 30,
        visitPrice: profile.visitPrice ?? 0,
        pricingLabel: (profile as any).pricingLabel ?? null,
        serviceModes:
          Array.isArray(profile.serviceModes) && profile.serviceModes.length
            ? (profile.serviceModes as any)
            : ['HOME'],
        serviceModesConfigured,
        requiresBackgroundCheck,
        backgroundCheckApproved,
        officeAddressId: profile.officeAddressId ?? null,
        officeAddress: profile.officeAddress
          ? {
              id: profile.officeAddress.id,
              formatted: profile.officeAddress.formatted,
              lat: profile.officeAddress.lat,
              lng: profile.officeAddress.lng,
              placeId: profile.officeAddress.placeId ?? null,
            }
          : null,

        availability: avail ?? ({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } as any),
        ratingAvg,
        ratingCount,
        badge,
        kycStatus: profile.kycStatus as any,
        kyc: lastKyc
          ? {
              status: lastKyc.status as any,
              rejectionReason: lastKyc.rejectionReason ?? null,
              createdAt: lastKyc.createdAt ? lastKyc.createdAt.toISOString() : null,
              reviewedAt: lastKyc.reviewedAt ? lastKyc.reviewedAt.toISOString() : null,
              dniFrontUrl: lastKyc.dniFrontUrl ? toAbsoluteUrl(lastKyc.dniFrontUrl) : null,
              dniBackUrl: lastKyc.dniBackUrl ? toAbsoluteUrl(lastKyc.dniBackUrl) : null,
              selfieUrl: lastKyc.selfieUrl ? toAbsoluteUrl(lastKyc.selfieUrl) : null,
            }
          : null,

        backgroundCheck: profile.backgroundCheck
          ? {
              status: profile.backgroundCheck.status,
              reviewedAt: profile.backgroundCheck.reviewedAt
                ? profile.backgroundCheck.reviewedAt.toISOString()
                : null,
              rejectionReason: profile.backgroundCheck.rejectionReason ?? null,
              fileUrl: profile.backgroundCheck.fileUrl
                ? toAbsoluteUrl(profile.backgroundCheck.fileUrl)
                : null,
            }
          : null,

        specialties: profile.specialties.map((s) => s.category.slug),
        avatarUrl: profile.avatarUrl ?? null,
        stats: { done, canceled },
        centerLat: profile.centerLat ?? null,
        centerLng: profile.centerLng ?? null,
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /specialists/me', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** PATCH /specialists/me */
router.patch('/me', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    dbg(debugSpecialists, '[PATCH /specialists/me] raw body:', req.body);

    const parsed = PatchMeSchema.safeParse(req.body);
    if (!parsed.success) {
      dbg(debugSpecialists, '[PATCH /specialists/me] zod error:', parsed.error.flatten());
      return res
        .status(400)
        .json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
    }

    const data = parsed.data;

    const maxAllowedRadiusKm = await getMaxAllowedRadiusKmForUser(userId);

    if (data.radiusKm !== undefined && data.radiusKm > maxAllowedRadiusKm) {
      return res.status(400).json({
        ok: false,
        error: 'radius_exceeds_allowed_max',
        maxAllowedRadiusKm,
      });
    }

    const current = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: {
        availability: true,
        kycStatus: true,
        serviceModes: true,
        officeAddressId: true,
      },
    });

    const currentAvail = (current?.availability as any) ?? {
      days: [1, 2, 3, 4, 5],
      start: '09:00',
      end: '18:00',
    };

    if (data.available === true) {
      // ✅ SUSCRIPCIÓN: si no está OK, no puede ponerse disponible
      const gate = await canSpecialistBeVisible(userId);

      dbg(debugSpecialists, '[availability gate]', { userId, gate });

      if (!gate.ok) {
        return res.status(403).json({
          ok: false,
          error: 'subscription_required',
          status: gate.status ?? null,
        });
      }

      const kyc = current?.kycStatus ?? 'UNVERIFIED';
      if (kyc !== 'VERIFIED') {
        return res.status(403).json({ ok: false, error: 'kyc_required' });
      }

      // ✅ usuario bloqueado
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });

      if (u && (u as any).status === 'BLOCKED') {
        return res.status(403).json({ ok: false, error: 'user_blocked' });
      }

      // ✅ perfil y modalidades efectivas
      const spec = await prisma.specialistProfile.findUnique({
        where: { userId },
        select: { id: true, serviceModes: true },
      });

      if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

      const nextServiceModes =
        data.serviceModes !== undefined ? data.serviceModes : (spec.serviceModes as any);

      const requiresBackgroundCheck = requiresBackgroundCheckByServiceModes(nextServiceModes);

      if (requiresBackgroundCheck) {
        const bgOk = await hasApprovedBackgroundCheck(spec.id);

        if (!bgOk) {
          return res.status(403).json({
            ok: false,
            error: 'background_check_required',
          });
        }
      }
    }

    let nextAvail = currentAvail;

    // ✅ NUEVO: serviceModes + officeAddress (OFFICE)
    let nextOfficeAddressId: string | null | undefined = undefined;

    // Si mandan serviceModes, validamos reglas
    if (data.serviceModes !== undefined) {
      const includesOffice = data.serviceModes.includes('OFFICE');

      dbg(debugSpecialists, '[PATCH /specialists/me] serviceModes:', data.serviceModes);
      dbg(debugSpecialists, '[PATCH /specialists/me] includesOffice:', includesOffice);
      dbg(debugSpecialists, '[PATCH /specialists/me] officeAddress:', data.officeAddress);

      if (includesOffice) {
        if (!data.officeAddress) {
          return res.status(400).json({ ok: false, error: 'office_address_required' });
        }

        const officeAddress = data.officeAddress;

        let formatted = String(officeAddress.formatted ?? '').trim();
        if (!formatted) {
          return res.status(400).json({ ok: false, error: 'office_address_required' });
        }

        // 1) Tomar coords si vienen
        let lat = officeAddress.lat;
        let lng = officeAddress.lng;
        let inferredLocality: string | null = null;

        // 2) Si NO vienen coords, geocodificar con fallback seguro
        if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
          try {
            const result = await geocodeOfficeAddressWithFallback({
              formatted,
              locality: officeAddress.locality ?? null,
            });

            inferredLocality = result.inferredLocality;
            formatted = result.usedFormatted;

            dbg(debugSpecialists, '[PATCH /specialists/me] geocode input', {
              originalFormatted: result.originalFormatted,
              normalizedFormatted: result.usedFormatted,
              locality: officeAddress.locality ?? null,
              inferredLocality,
            });

            dbg(debugSpecialists, '[PATCH /specialists/me] geocode result', {
              normalizedFormatted: result.usedFormatted,
              geo: result.geo,
            });

            lat = result.geo?.lat;
            lng = result.geo?.lng;
          } catch (e) {
            dbg(debugSpecialists, '[PATCH /specialists/me] geocodeAddress failed', {
              originalFormatted: officeAddress.formatted,
              normalizedFormatted: formatted,
              locality: officeAddress.locality ?? null,
              inferredLocality,
              error: e instanceof Error ? { message: e.message, stack: e.stack } : e,
            });

            return res.status(400).json({
              ok: false,
              error: 'office_geocode_failed',
              message:
                'No pudimos ubicar esa dirección. Revisá que la calle esté bien escrita y agregá altura, barrio o una referencia.',
            });
          }

          if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
            dbg(debugSpecialists, '[PATCH /specialists/me] geocode returned invalid coords', {
              originalFormatted: officeAddress.formatted,
              normalizedFormatted: formatted,
              locality: officeAddress.locality ?? null,
              inferredLocality,
              lat,
              lng,
            });

            return res.status(400).json({
              ok: false,
              error: 'office_geocode_failed',
              message:
                'No pudimos ubicar esa dirección. Revisá que la calle esté bien escrita y agregá altura, barrio o una referencia.',
            });
          }
        }

        // Córdoba-only por coordenadas (tu check)
        const inCordoba = lat >= -35.5 && lat <= -29.0 && lng >= -66.8 && lng <= -62.0;
        if (!inCordoba) {
          dbg(debugSpecialists, '[PATCH /specialists/me] office coords outside cordoba', {
            originalFormatted: officeAddress.formatted,
            normalizedFormatted: formatted,
            lat,
            lng,
          });

          return res.status(400).json({
            ok: false,
            error: 'office_coords_outside_cordoba',
            message:
              'La dirección encontrada quedó fuera de Córdoba. Revisá la calle y la localidad ingresadas.',
          });
        }

        // Upsert address (recomendación: NO usar upsert por placeId si placeId es null)
        let addressId: string;

        if (current?.officeAddressId) {
          // ✅ Ya existe dirección → actualizar
          const updatedAddress = await prisma.address.update({
            where: { id: current.officeAddressId },
            data: {
              placeId: officeAddress.placeId ?? null,
              formatted,
              lat,
              lng,
            },
            select: { id: true },
          });

          addressId = updatedAddress.id;
        } else {
          // ✅ No existe → crear
          const createdAddress = await prisma.address.create({
            data: {
              placeId: officeAddress.placeId ?? null,
              formatted,
              lat,
              lng,
            },
            select: { id: true },
          });

          addressId = createdAddress.id;
        }

        nextOfficeAddressId = addressId;
      } else {
        // si NO incluye OFFICE, limpiamos officeAddressId
        nextOfficeAddressId = null;
      }
    }

    if (data.availability) {
      nextAvail = { ...currentAvail, ...data.availability };

      // ✅ Si viene formato nuevo con ranges, limpiamos start/end viejos
      if (Array.isArray(data.availability.ranges) && data.availability.ranges.length > 0) {
        delete (nextAvail as Record<string, unknown>).start;
        delete (nextAvail as Record<string, unknown>).end;

        const rangeCount = data.availability.ranges.length;
        (nextAvail as Record<string, unknown>).mode =
          rangeCount === 1 ? 'single' : rangeCount === 2 ? 'split' : 'single';
      }

      // ✅ Si viene formato viejo start/end, limpiamos ranges viejos
      if (data.availability.start && data.availability.end) {
        delete (nextAvail as Record<string, unknown>).ranges;

        (nextAvail as Record<string, unknown>).mode =
          data.availability.start === data.availability.end ? 'allday' : 'single';
      }
    }

    // ✅ NO guardar enabled dentro de availability (evita inconsistencias)
    if (nextAvail && typeof nextAvail === 'object') {
      delete (nextAvail as Record<string, unknown>).enabled;
    }

    const setAvailableNow = typeof data.available === 'boolean' ? data.available : undefined;

    const updated = await prisma.specialistProfile.upsert({
      where: { userId },
      create: {
        userId,
        bio: data.bio ?? '',
        specialtyHeadline: data.specialtyHeadline ?? null,
        radiusKm: data.radiusKm ?? null,
        visitPrice: data.visitPrice ?? null,
        pricingLabel: data.pricingLabel ?? null,
        businessName: data.businessName?.trim() ? data.businessName.trim() : null,
        availability: nextAvail as any,
        kycStatus: 'PENDING',
        avatarUrl: data.avatarUrl ?? null,
        centerLat: data.centerLat ?? null,
        centerLng: data.centerLng ?? null,
        availableNow: false,
        serviceModes: (data.serviceModes as any) ?? ['HOME'],
        officeAddressId: nextOfficeAddressId ?? null,
      },
      update: {
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.specialtyHeadline !== undefined
          ? { specialtyHeadline: data.specialtyHeadline }
          : {}),

        ...(data.radiusKm !== undefined ? { radiusKm: data.radiusKm } : {}),
        ...(data.visitPrice !== undefined ? { visitPrice: data.visitPrice } : {}),
        ...(data.pricingLabel !== undefined ? { pricingLabel: data.pricingLabel } : {}),
        ...(data.businessName !== undefined
          ? { businessName: data.businessName?.trim() ? data.businessName.trim() : null }
          : {}),
        availability: nextAvail as any,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.centerLat !== undefined ? { centerLat: data.centerLat } : {}),
        ...(data.centerLng !== undefined ? { centerLng: data.centerLng } : {}),
        ...(setAvailableNow !== undefined
          ? { availableNow: current?.kycStatus === 'VERIFIED' ? setAvailableNow : false }
          : {}),
        ...(data.serviceModes !== undefined
          ? {
              serviceModes: {
                set: data.serviceModes as any,
              },
            }
          : {}),

        ...(nextOfficeAddressId !== undefined ? { officeAddressId: nextOfficeAddressId } : {}),
      },
      select: { id: true },
    });

    await syncSearchIndexForUser(userId);

    return res.json({ ok: true, id: updated.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production') console.error('PATCH /specialists/me', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** PATCH /specialists/specialties */
router.patch('/specialties', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const schema = z.object({ specialties: z.array(z.string().min(1)).min(1) });
    const { specialties } = schema.parse(req.body);

    const profile = await prisma.specialistProfile.upsert({
      where: { userId },
      create: { userId, kycStatus: 'PENDING' },
      update: {},
      select: { id: true },
    });

    const cats = await prisma.serviceCategory.findMany({
      where: { slug: { in: specialties } },
      select: { id: true },
    });
    if (cats.length === 0) return res.status(400).json({ ok: false, error: 'invalid_specialties' });

    await prisma.specialistSpecialty.deleteMany({ where: { specialistId: profile.id } });
    await prisma.specialistSpecialty.createMany({
      data: cats.map((c) => ({ specialistId: profile.id, categoryId: c.id })),
      skipDuplicates: true,
    });

    const maxAllowedRadiusKm = await getMaxAllowedRadiusKmForUser(userId);

    const currentProfile = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true, radiusKm: true },
    });

    if (
      currentProfile &&
      currentProfile.radiusKm != null &&
      currentProfile.radiusKm > maxAllowedRadiusKm
    ) {
      await prisma.specialistProfile.update({
        where: { id: currentProfile.id },
        data: { radiusKm: maxAllowedRadiusKm },
      });
    }

    await syncSearchIndexForUser(userId);

    return res.json({
      ok: true,
      count: cats.length,
      maxAllowedRadiusKm,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production') console.error('PATCH /specialists/specialties', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** ========= CERTIFICATIONS ========= */

/** POST /specialists/certifications/upload (PDF o imagen) */
router.post('/certifications/upload', auth, (req: Request, res: Response) => {
  uploadAny.single('file')(req, res, async (err: any) => {
    const maybe = multerErrorToResponse(err, res);
    if (maybe) return;

    const r = req as MulterReq;

    try {
      if (!r.file) return res.status(400).json({ ok: false, error: 'file_required' });

      const isPdf = r.file.mimetype === 'application/pdf';
      if (isPdf) {
        const relative = `/uploads/certifications/${path.basename(r.file.path)}`;

        return res.json({ ok: true, url: relative, format: 'pdf' });
      }

      const meta = await sharp(r.file.path).rotate().metadata();
      const minW = 800;
      const minH = 600;

      if (!meta.width || !meta.height || meta.width < minW || meta.height < minH) {
        try {
          fs.unlinkSync(r.file.path);
        } catch {}
        return res.status(400).json({ ok: false, error: 'low_quality', minW, minH });
      }

      const webpPath = r.file.path + '.webp';
      await sharp(r.file.path).rotate().webp({ quality: 86 }).toFile(webpPath);
      try {
        fs.unlinkSync(r.file.path);
      } catch {}

      const relative = `/uploads/certifications/${path.basename(webpPath)}`;

      return res.json({ ok: true, url: relative, format: 'webp' });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production')
        console.error('POST /specialists/certifications/upload', e);
      return res.status(500).json({ ok: false, error: 'server_error' });
    }
  });
});

/** POST /specialists/certifications (upsert por rubro) */
router.post('/certifications', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const schema = z.object({
      categorySlug: z.string().min(1),
      fileUrl: urlLike,
      number: z.string().max(120).optional().nullable(),
      issuer: z.string().max(180).optional().nullable(),
      expiresAt: z.string().datetime().optional().nullable(),
    });

    const body = schema.parse(req.body);

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

    const cat = await prisma.serviceCategory.findUnique({
      where: { slug: body.categorySlug },
      select: { id: true },
    });
    if (!cat) return res.status(400).json({ ok: false, error: 'invalid_category' });

    const created = await prisma.specialistCertification.upsert({
      where: {
        specialistId_categoryId: { specialistId: spec.id, categoryId: cat.id },
      },
      create: {
        specialistId: spec.id,
        categoryId: cat.id,
        fileUrl: toAbsoluteUrl(body.fileUrl),
        number: body.number ?? null,
        issuer: body.issuer ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        status: 'PENDING',
      },
      update: {
        fileUrl: toAbsoluteUrl(body.fileUrl),
        number: body.number ?? null,
        issuer: body.issuer ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        status: 'PENDING',
      },
      select: { id: true, status: true },
    });

    return res.json({ ok: true, certification: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production')
      console.error('POST /specialists/certifications', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** GET /specialists/certifications (listar del especialista) */
router.get('/certifications', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!spec) return res.json({ ok: true, items: [] });

    const items = await prisma.specialistCertification.findMany({
      where: { specialistId: spec.id },
      include: { category: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      ok: true,
      items: items.map((x) => ({
        ...x,
        fileUrl: toAbsoluteUrl(x.fileUrl),
      })),
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /specialists/certifications', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** POST /specialists/portfolio/upload (solo imagen) */
router.post('/portfolio/upload', auth, (req: Request, res: Response) => {
  uploadPortfolio.single('file')(req, res, async (err: any) => {
    const maybe = multerErrorToResponse(err, res);
    if (maybe) return;

    const r = req as MulterReq;

    try {
      if (!r.file) return res.status(400).json({ ok: false, error: 'file_required' });

      const meta = await sharp(r.file.path).rotate().metadata();
      const minW = 800;
      const minH = 600;

      if (!meta.width || !meta.height || meta.width < minW || meta.height < minH) {
        try {
          fs.unlinkSync(r.file.path);
        } catch {}
        return res.status(400).json({ ok: false, error: 'low_quality', minW, minH });
      }

      const webpPath = r.file.path + '.webp';
      await sharp(r.file.path)
        .rotate()
        .resize({ width: 1400, withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(webpPath);

      try {
        fs.unlinkSync(r.file.path);
      } catch {}

      const relative = `/uploads/portfolio/${path.basename(webpPath)}`;

      return res.json({
        ok: true,
        url: relative,
        format: 'webp',
        width: meta.width,
        height: meta.height,
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production')
        console.error('POST /specialists/portfolio/upload', e);
      return res.status(500).json({ ok: false, error: 'server_error' });
    }
  });
});

/** GET /specialists/me/portfolio */
router.get('/me/portfolio', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!spec) return res.json({ ok: true, items: [] });

    const items = await prisma.specialistPortfolioImage.findMany({
      where: { specialistId: spec.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        imageUrl: true,
        thumbUrl: true,
        caption: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      items: items.map((x) => ({
        ...x,
        imageUrl: toAbsoluteUrl(x.imageUrl),
        thumbUrl: x.thumbUrl ? toAbsoluteUrl(x.thumbUrl) : null,
      })),
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /specialists/me/portfolio', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** POST /specialists/me/portfolio */
router.post('/me/portfolio', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const schema = z.object({
      imageUrl: urlLike,
      thumbUrl: urlLike.optional().nullable(),
      caption: z.string().max(140).optional().nullable(),
    });

    const body = schema.parse(req.body);

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

    const count = await prisma.specialistPortfolioImage.count({
      where: { specialistId: spec.id },
    });

    if (count >= 8) {
      return res.status(400).json({ ok: false, error: 'portfolio_limit_reached' });
    }

    const item = await prisma.specialistPortfolioImage.create({
      data: {
        specialistId: spec.id,
        imageUrl: body.imageUrl,
        thumbUrl: body.thumbUrl ?? null,
        caption: body.caption ?? null,
        sortOrder: count,
      },
      select: {
        id: true,
        imageUrl: true,
        thumbUrl: true,
        caption: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      item: {
        ...item,
        imageUrl: toAbsoluteUrl(item.imageUrl),
        thumbUrl: item.thumbUrl ? toAbsoluteUrl(item.thumbUrl) : null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: err.flatten() });
    }
    if (process.env.NODE_ENV !== 'production') console.error('POST /specialists/me/portfolio', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/** DELETE /specialists/me/portfolio/:id */
router.delete('/me/portfolio/:id', auth, async (req: AuthReq, res: Response) => {
  try {
    const userId = req.user?.id;
    const itemId = String(req.params.id ?? '').trim();

    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!itemId) return res.status(400).json({ ok: false, error: 'invalid_id' });

    const spec = await prisma.specialistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

    const item = await prisma.specialistPortfolioImage.findFirst({
      where: {
        id: itemId,
        specialistId: spec.id,
      },
      select: {
        id: true,
        imageUrl: true,
        thumbUrl: true,
      },
    });

    if (!item) return res.status(404).json({ ok: false, error: 'not_found' });

    await prisma.specialistPortfolioImage.delete({
      where: { id: item.id },
    });

    const maybeDeleteLocal = (u?: string | null) => {
      if (!u) return;

      let relativePath = u;

      // si viene absoluta, extraemos solo la parte /uploads/...
      try {
        if (/^https?:\/\//i.test(u)) {
          const parsed = new URL(u);
          relativePath = parsed.pathname;
        }
      } catch {
        relativePath = u;
      }

      if (!relativePath.startsWith('/uploads/')) return;

      const abs = path.join(uploadsRoot, relativePath.replace(/^\/uploads\//, ''));

      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {}
    };

    maybeDeleteLocal(item.imageUrl);
    maybeDeleteLocal(item.thumbUrl);

    return res.json({ ok: true });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.error('DELETE /specialists/me/portfolio/:id', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* ─────────────────────────────────────────────────────────────────────
 * RUTA PÚBLICA AL FINAL: GET /specialists/:id
 * ────────────────────────────────────────────────────────────────────*/

/** GET /specialists/:id/portfolio */
router.get('/:id/portfolio', async (req, res) => {
  try {
    const specialistId = String(req.params.id ?? '').trim();
    if (!specialistId) return res.status(400).json({ ok: false, error: 'invalid_id' });

    const spec = await prisma.specialistProfile.findUnique({
      where: { id: specialistId },
      select: { id: true },
    });

    if (!spec) return res.status(404).json({ ok: false, error: 'not_found' });

    const items = await prisma.specialistPortfolioImage.findMany({
      where: { specialistId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        imageUrl: true,
        thumbUrl: true,
        caption: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      items: items.map((x) => ({
        ...x,
        imageUrl: toAbsoluteUrl(x.imageUrl),
        thumbUrl: x.thumbUrl ? toAbsoluteUrl(x.thumbUrl) : null,
      })),
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /specialists/:id/portfolio', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lng = req.query.lng ? Number(req.query.lng) : undefined;

    const spec = await prisma.specialistProfile.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        businessName: true,
        user: { select: { status: true } },
        bio: true,
        visitPrice: true,
        pricingLabel: true,
        currency: true,
        availableNow: true,
        kycStatus: true,
        badge: true,
        ratingAvg: true,
        ratingCount: true,
        centerLat: true,
        centerLng: true,
        radiusKm: true,
        availability: true,
        avatarUrl: true,
        serviceModes: true,
        officeAddressId: true,
        backgroundCheck: { select: { status: true } },
        specialties: {
          select: {
            categoryId: true,
            category: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
    if (!spec) return res.status(404).json({ ok: false, error: 'Not found' });

    const userOk = spec.user?.status !== 'BLOCKED';
    const requiresBackgroundCheck = requiresBackgroundCheckByServiceModes(spec.serviceModes);
    const bgApproved = spec.backgroundCheck?.status === 'APPROVED';
    const bgOk = requiresBackgroundCheck ? bgApproved : true;

    const safeAvailableNow =
      userOk && spec.kycStatus === 'VERIFIED' && bgOk ? !!spec.availableNow : false;

    const user = await prisma.user.findUnique({
      where: { id: spec.userId },
      select: { name: true, surname: true },
    });

    let distanceKm: number | undefined;
    if (
      lat != null &&
      lng != null &&
      spec.centerLat != null &&
      spec.centerLng != null &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lng)
    ) {
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(spec.centerLat - lat);
      const dLng = toRad(spec.centerLng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(spec.centerLat)) * Math.sin(dLng / 2) ** 2;
      distanceKm = 2 * 6371 * Math.asin(Math.sqrt(a));
    }

    // ✅ Si viene categorySlug, devolvemos services SOLO de ese rubro
    let categorySlug = typeof req.query.categorySlug === 'string' ? req.query.categorySlug : '';
    categorySlug = categorySlug.trim().toLowerCase();

    const CATEGORY_ALIASES: Record<string, string> = {
      // Informática y electrónica
      'aire-acond': 'climatizacion',
      'st-electronica': 'servicio-tecnico-electronica',
      'st-electrodom': 'servicio-tecnico-electrodomesticos',
      'st-informatica': 'servicio-tecnico-informatica',

      // Seguridad
      'camaras-alarmas': 'camaras-y-alarmas',
      'personal-seg': 'personal-de-seguridad',

      // Servicios
      'acompanante-ter': 'acompanante-terapeutico',
      'clases-part': 'clases-particulares',
      'paseador-perros': 'paseador-de-perros',
    };

    const rawCategorySlug = categorySlug;
    categorySlug = CATEGORY_ALIASES[categorySlug] ?? categorySlug;

    // ✅ enabled por rubro (si viene categorySlug) usando requiresCertification
    let enabled = false;

    // 👇 NUEVO: info para UI (detalle)
    let requiresCertification = false;
    let certStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null = null;
    let categoryEnabled = false;

    if (categorySlug) {
      const cat = await prisma.serviceCategory.findUnique({
        where: { slug: categorySlug },
        select: { id: true, requiresCertification: true },
      });

      requiresCertification = !!cat?.requiresCertification;

      if (cat) {
        if (!requiresCertification) {
          // no requiere matrícula => habilitado
          categoryEnabled = true;
          enabled = true;
          certStatus = null;
        } else {
          const cert = await prisma.specialistCertification.findUnique({
            where: { specialistId_categoryId: { specialistId: spec.id, categoryId: cat.id } },
            select: { status: true },
          });

          certStatus = (cert?.status as any) ?? null;
          categoryEnabled = cert?.status === 'APPROVED';
          enabled = categoryEnabled;
        }
      } else {
        // categoría inexistente
        requiresCertification = false;
        certStatus = null;
        categoryEnabled = false;
        enabled = false;
      }
    } else {
      // fallback (si no viene rubro): mantenemos compat anterior
      const hasApproved = await prisma.specialistCertification.findFirst({
        where: { specialistId: spec.id, status: 'APPROVED' },
        select: { id: true },
      });

      enabled = Boolean(hasApproved);

      // en modo "sin rubro", no aplican estos flags
      requiresCertification = false;
      certStatus = null;
      categoryEnabled = true;
    }

    if (rawCategorySlug && rawCategorySlug !== categorySlug) {
      console.log('[GET /specialists/:id][alias]', { rawCategorySlug, mappedTo: categorySlug });
    }

    // categorías (IDs) que el especialista realmente tiene
    const specialtyBySlug = new Map(spec.specialties.map((s) => [s.category.slug, s.categoryId]));

    // ✅ Si pidieron un rubro que el especialista NO tiene, forzamos enabled=false
    if (categorySlug && !specialtyBySlug.has(categorySlug)) {
      enabled = false;
      categoryEnabled = false;
    }

    // Si no pasan categorySlug, devolvemos servicios de todas las specialties (como antes)
    const categoryIds = categorySlug
      ? specialtyBySlug.get(categorySlug)
        ? [specialtyBySlug.get(categorySlug)!]
        : []
      : spec.specialties.map((s) => s.categoryId);

    // Si pidieron un slug que el especialista NO tiene, devolvemos vacío + default null
    // (el mobile va a mostrar alerta)
    let servicesRows =
      categoryIds.length > 0
        ? await prisma.service.findMany({
            where: { categoryId: { in: categoryIds } },
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
          })
        : [];

    // ✅ Auto-crear un Service default si NO existe ninguno para esa categoría puntual
    // (Solo cuando viene categorySlug y el especialista tiene esa specialty)
    if (categorySlug && categoryIds.length === 1 && servicesRows.length === 0) {
      const categoryId = categoryIds[0];

      // Nombre fijo para no crear múltiples; está protegido por @@unique([categoryId, name])
      const defaultName = 'Servicio general';

      await prisma.service.upsert({
        where: {
          categoryId_name: { categoryId, name: defaultName },
        },
        create: {
          categoryId,
          name: defaultName,
          description: null,
          basePoints: 0,
          slaHours: 0,
          basePrice: null,
        },
        update: {},
        select: { id: true },
      });

      // Releer
      servicesRows = await prisma.service.findMany({
        where: { categoryId },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    const services = servicesRows;
    const defaultServiceId: string | null = servicesRows[0]?.id ?? null;

    const { done, canceled } = await getSpecialistStatsById(id);

    const ratingRows = await prisma.rating.findMany({
      where: {
        order: {
          specialistId: id,
          status: {
            in: [
              'CONFIRMED_BY_CLIENT',
              'CLOSED',
              'FINISHED_BY_SPECIALIST',
              'IN_CLIENT_REVIEW',
            ] as any,
          },
        },
      },
      select: {
        orderId: true,
        score: true,
        comment: true,
        createdAt: true,
        reviewer: { select: { name: true, surname: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reviews = ratingRows.map((r) => ({
      id: r.orderId,
      rating: r.score,
      comment: r.comment ?? null,
      author: `${r.reviewer?.name ?? ''} ${r.reviewer?.surname ?? ''}`.trim() || 'Usuario',
      avatarUrl: null,
      createdAt: r.createdAt.toISOString(),
    }));

    return res.json({
      id: spec.id,
      name: spec.businessName?.trim()
        ? spec.businessName.trim()
        : `${user?.name ?? 'Especialista'} ${user?.surname ?? ''}`.trim(),
      avatarUrl: spec.avatarUrl ?? null,
      ratingAvg: spec.ratingAvg,
      ratingCount: spec.ratingCount,
      badge: spec.badge,
      enabled,
      requiresCertification,
      certStatus,
      categoryEnabled,
      availableNow: safeAvailableNow,
      visitPrice: spec.visitPrice,
      pricingLabel: spec.pricingLabel ?? null,
      currency: spec.currency,
      bio: spec.bio,
      centerLat: spec.centerLat,
      centerLng: spec.centerLng,
      radiusKm: spec.radiusKm,
      distanceKm,
      availability: spec.availability,
      serviceModes:
        Array.isArray((spec as any).serviceModes) && (spec as any).serviceModes.length
          ? (spec as any).serviceModes
          : ['HOME'],
      serviceModesConfigured: hasExplicitServiceModes(spec.serviceModes),
      requiresBackgroundCheck,
      backgroundCheckApproved: !!bgApproved,
      officeAddressId: (spec as any).officeAddressId ?? null,
      specialties: spec.specialties.map((s) => ({
        id: s.category.id,
        name: s.category.name,
        slug: s.category.slug,
      })),
      stats: { done, canceled },
      reviews,
      defaultServiceId,
      services,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /specialists/:id', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export const specialistsRoutes = router;
