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
import { notifyBackgroundCheckStatus } from '../services/notifyBackgroundCheck';
import { notifyKycStatus } from '../services/notifyKyc';
import { canSpecialistBeVisible } from '../services/subscriptionGate';

/** ========= Storage local (MVP) ========= **/

const router = Router();

const kycDir = path.join(uploadsRoot, 'kyc');
const certsDir = path.join(uploadsRoot, 'certifications');
const backgroundChecksDir = path.join(uploadsRoot, 'background-checks');

ensureDir(kycDir);
ensureDir(certsDir);
ensureDir(backgroundChecksDir);

const DEBUG_UPLOADS = process.env.NODE_ENV !== 'production' || process.env.DEBUG_UPLOADS === 'true';

if (DEBUG_UPLOADS) {
  console.log('[specialists.routes] uploadsRoot =', uploadsRoot);
  console.log('[specialists.routes] kycDir =', kycDir);
  console.log('[specialists.routes] certsDir =', certsDir);
  console.log('[specialists.routes] backgroundChecksDir =', backgroundChecksDir);
}

/** ========= Multer storages ========= **/
const storageKyc = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, kycDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '');
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

/** Solo imágenes (JPEG/PNG/WebP) — KYC */
const upload = multer({
  storage: storageKyc,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|webp)$/i.test(file.mimetype);
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

type MulterReq = Request & { file?: Express.Multer.File };
type AuthReq = Request & { user?: { id: string; role: string } };

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
  const start: string | undefined = availability.start;
  const end: string | undefined = availability.end;

  // si falta algo => no bloquea
  if (!days.length || !start || !end) return true;

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

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return true;

  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  // ✅ 24hs: si start === end, se considera abierto todo el día
  if (startMins === endMins) return true;

  // soporta cruce de medianoche
  if (endMins > startMins) {
    return currentMins >= startMins && currentMins <= endMins;
  }
  return currentMins >= startMins || currentMins <= endMins;
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
      user: { select: { status: true } },
      backgroundCheck: { select: { status: true } }, // ✅ NUEVO
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

  const bgOk = spec.backgroundCheck?.status === 'APPROVED';

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

  const bg = await prisma.specialistBackgroundCheck.findUnique({
    where: { specialistId: opts.specialistId },
    select: { status: true },
  });

  const bgOk = bg?.status === 'APPROVED';
  const gate = await canSpecialistBeVisible(opts.userId);
  const subOk = gate.ok; // ACTIVE o TRIALING válido

  const toggleOk = !!opts.availableNow;
  const scheduleOk = isWithinAvailability(opts.availability);

  return {
    userOk,
    kycOk,
    bgOk,
    subOk,
    toggleOk,
    scheduleOk,
    canToggle: userOk && kycOk && bgOk,
    visibleNow: userOk && kycOk && bgOk && toggleOk && scheduleOk,
  };
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
  // ✅ evita caches (proxy, cdn, etc)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  console.log('[GET /specialists/search]', {
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
      console.log('[GET /specialists/search][alias]', { rawCategory, mappedTo: category });
    }

    const lat = Number(req.query.lat ?? NaN);
    const lng = Number(req.query.lng ?? NaN);
    const radiusKm = Number(req.query.radiusKm ?? 8);

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

    const deg = radiusKm / 111;
    const latMin = lat - deg;
    const latMax = lat + deg;
    const lngMin = lng - deg;
    const lngMax = lng + deg;

    const visitPriceFilter =
      priceMin != null || priceMax != null
        ? { gte: priceMin ?? undefined, lte: priceMax ?? undefined }
        : undefined;

    // 1) preselección rápida
    const pre = await prisma.specialistSearchIndex.findMany({
      where: {
        categorySlugs: category ? { has: category } : undefined,
        centerLat: { gte: latMin, lte: latMax },
        centerLng: { gte: lngMin, lte: lngMax },
        ...(verifiedFilter !== undefined ? { verified: verifiedFilter } : {}),
        ...(visitPriceFilter ? { visitPrice: visitPriceFilter } : {}),
      },
      take: 120,
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

    if (withDist.length === 0) return res.json([]);

    // 3) enriquecer con datos reales del profile (incluye availability)
    const profiles = await prisma.specialistProfile.findMany({
      where: { id: { in: withDist.map((x) => x.specialistId) } },
      select: {
        id: true,
        userId: true,
        kycStatus: true,
        specialtyHeadline: true,
        avatarUrl: true,
        availability: true,
        availableNow: true,
        pricingLabel: true,
        backgroundCheck: { select: { status: true } },
        user: { select: { status: true } },
      },
    });

    const users = await prisma.user.findMany({
      where: { id: { in: profiles.map((p) => p.userId) } },
      select: { id: true, name: true, surname: true },
    });

    const profById = new Map(profiles.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    // 3.5) Habilitación por rubro (certificación) + info para UI
    const enabledBySpecialistId = new Map<string, boolean>();
    const certStatusBySpecialistId = new Map<string, 'PENDING' | 'APPROVED' | 'REJECTED' | null>();

    let requiresCertificationForCategory = false;

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
        const certs = await prisma.specialistCertification.findMany({
          where: {
            specialistId: { in: withDist.map((x) => x.specialistId) },
            categoryId: cat.id,
          },
          select: { specialistId: true, status: true },
        });

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
    }

    // ✅ cache por request para evitar N llamadas repetidas a canSpecialistBeVisible
    const gateCache = new Map<string, { ok: boolean; status?: string | null }>();

    const gateFor = async (userId: string) => {
      if (!userId) return { ok: false, status: null };
      const hit = gateCache.get(userId);
      if (hit) return hit;
      const gate = await canSpecialistBeVisible(userId);
      gateCache.set(userId, gate);
      return gate;
    };

    // 4) construir lista final + disponibilidad REAL (toggle + horario)
    let enriched = await Promise.all(
      withDist.map(async (x) => {
        const prof = profById.get(x.specialistId);
        const user = prof ? userById.get(prof.userId) : undefined;

        // ✅ 1) userOk viene del profile.user.status (ya lo traés en select)
        const userOk = prof?.user?.status !== 'BLOCKED';

        // ✅ 2) disponibilidad real
        const kycOk = prof?.kycStatus === 'VERIFIED';
        const bgOk = prof?.backgroundCheck?.status === 'APPROVED';
        const toggleAvailable = kycOk && bgOk ? !!prof?.availableNow : false;
        const scheduleOk = isWithinAvailability(prof?.availability);

        const gate = await gateFor(prof?.userId ?? '');
        const subOk = gate.ok;

        const visible = userOk && kycOk && bgOk && subOk && toggleAvailable; // ⬅️ NO incluye horario
        const availableNow = visible && scheduleOk; // ⬅️ SOLO para la pill

        const name = `${user?.name ?? 'Especialista'} ${user?.surname ?? ''}`.trim();

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

          // 👇 compat (hasta que el mobile use categoryEnabled)
          enabled: categoryEnabled,

          // 👇 nuevos campos para dejarlo perfecto
          requiresCertification: category ? requiresCertificationForCategory : false,
          certStatus,
          categoryEnabled,

          kycStatus: prof?.kycStatus ?? 'UNVERIFIED',
          avatarUrl: prof?.avatarUrl ?? null,
          visible,
          availableNow, // pill (incluye horario)
          pricingLabel: prof?.pricingLabel ?? null,
          specialtyHeadline: (prof as any)?.specialtyHeadline ?? null,
        };
      }),
    );

    enriched = enriched.filter((x) => x.userOk !== false && x.visible === true);

    if (onlyAvailable) enriched = enriched.filter((x) => x.availableNow === true);
    if (onlyEnabled) enriched = enriched.filter((x) => x.enabled === true);

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

    return res.json(enriched.slice(0, 50));
  } catch (e) {
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
      await sharp(r.file.path).rotate().webp({ quality: 82 }).toFile(webpPath);
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
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.error('POST /specialists/kyc/upload', e);
      return res.status(500).json({ ok: false, error: 'server_error' });
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
      visitPrice: z.coerce.number().int().nonnegative().optional(),
      radiusKm: z.coerce.number().positive().optional(),
      pricingLabel: z.string().max(40).optional().nullable(), // ✅ NUEVO (opt)
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

    // 5) sync index
    await syncSearchIndexForUser(userId);
    console.log(`[spec/register] t3 after_search_index ms=${Date.now() - t0}`);

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

const AvailabilitySchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  enabled: z.boolean().optional(),
});

const PatchMeSchema = z.object({
  bio: z.string().max(1000).optional(),
  specialtyHeadline: z.string().max(60).optional().nullable(),
  available: z.boolean().optional(),
  radiusKm: z.coerce.number().int().min(0).max(30).optional(),
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

  // ✅ NUEVO: dirección de oficina (solo si incluye OFFICE)
  officeAddress: z
    .object({
      formatted: z.string().min(5),
      lat: z.number(),
      lng: z.number(),
      placeId: z.string().optional().nullable(),
    })
    .optional(),
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
        bio: profile.bio ?? '',
        specialtyHeadline: (profile as any).specialtyHeadline ?? null,
        available,
        availableNow,
        radiusKm: profile.radiusKm ?? 30,
        visitPrice: profile.visitPrice ?? 0,
        pricingLabel: (profile as any).pricingLabel ?? null,
        serviceModes: (profile.serviceModes as any) ?? ['HOME'],
        officeAddressId: profile.officeAddressId ?? null,

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

    const data = PatchMeSchema.parse(req.body);

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

      console.log('[DEBUG availability gate]', {
        userId,
        gate,
      });
      if (!gate.ok) {
        return res.status(403).json({
          ok: false,
          error: 'subscription_required',
          status: gate.status ?? null,
        });
      }

      const kyc = current?.kycStatus ?? 'UNVERIFIED';
      if (kyc !== 'VERIFIED') return res.status(403).json({ ok: false, error: 'kyc_required' });

      // ✅ NUEVO: si el usuario está bloqueado, no puede ponerse disponible
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });

      if (u && (u as any).status === 'BLOCKED') {
        return res.status(403).json({ ok: false, error: 'user_blocked' });
      }
      // ✅ NUEVO: antecedente penal aprobado
      const spec = await prisma.specialistProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!spec) return res.status(400).json({ ok: false, error: 'no_profile' });

      const bgOk = await hasApprovedBackgroundCheck(spec.id);
      if (!bgOk) return res.status(403).json({ ok: false, error: 'background_check_required' });
    }

    let nextAvail = currentAvail;

    // ✅ NUEVO: serviceModes + officeAddress (OFFICE)
    let nextOfficeAddressId: string | null | undefined = undefined;

    // Si mandan serviceModes, validamos reglas
    if (data.serviceModes) {
      const hasOffice = data.serviceModes.includes('OFFICE');

      if (hasOffice) {
        // si selecciona OFFICE, officeAddress es obligatoria
        if (!data.officeAddress) {
          return res.status(400).json({ ok: false, error: 'office_address_required' });
        }

        // Upsert Address por placeId si existe, sino create
        const placeId = data.officeAddress.placeId ?? null;

        if (placeId) {
          const addr = await prisma.address.upsert({
            where: { placeId },
            update: {
              formatted: data.officeAddress.formatted,
              lat: data.officeAddress.lat,
              lng: data.officeAddress.lng,
            },
            create: {
              placeId,
              formatted: data.officeAddress.formatted,
              lat: data.officeAddress.lat,
              lng: data.officeAddress.lng,
            },
            select: { id: true },
          });
          nextOfficeAddressId = addr.id;
        } else {
          const addr = await prisma.address.create({
            data: {
              placeId: null,
              formatted: data.officeAddress.formatted,
              lat: data.officeAddress.lat,
              lng: data.officeAddress.lng,
            },
            select: { id: true },
          });
          nextOfficeAddressId = addr.id;
        }
      } else {
        // si NO incluye OFFICE, limpiamos officeAddressId
        nextOfficeAddressId = null;
      }
    }

    if (data.availability) nextAvail = { ...currentAvail, ...data.availability };

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
        availability: nextAvail as any,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.centerLat !== undefined ? { centerLat: data.centerLat } : {}),
        ...(data.centerLng !== undefined ? { centerLng: data.centerLng } : {}),
        ...(setAvailableNow !== undefined
          ? { availableNow: current?.kycStatus === 'VERIFIED' ? setAvailableNow : false }
          : {}),
        ...(data.serviceModes !== undefined ? { serviceModes: data.serviceModes as any } : {}),
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

    await syncSearchIndexForUser(userId);

    return res.json({ ok: true, count: cats.length });
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

/* ─────────────────────────────────────────────────────────────────────
 * RUTA PÚBLICA AL FINAL: GET /specialists/:id
 * ────────────────────────────────────────────────────────────────────*/

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
        user: { select: { status: true } },
        bio: true,
        visitPrice: true,
        pricingLabel: true, // ✅ NUEVO
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
        backgroundCheck: { select: { status: true } }, // ✅ NUEVO
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
    const bgOk = spec.backgroundCheck?.status === 'APPROVED';

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
      name: `${user?.name ?? 'Especialista'} ${user?.surname ?? ''}`.trim(),
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
      pricingLabel: spec.pricingLabel ?? null, // ✅ NUEVO
      currency: spec.currency,
      bio: spec.bio,
      centerLat: spec.centerLat,
      centerLng: spec.centerLng,
      radiusKm: spec.radiusKm,
      distanceKm,
      availability: spec.availability,
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
