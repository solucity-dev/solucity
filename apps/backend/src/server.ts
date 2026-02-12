// apps/backend/src/server.ts

import fs from 'fs';
import path from 'path';

import cors from 'cors';
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import './config/env';

import { prisma } from './lib/prisma';
import { ensureQaUsers } from './lib/qa';
import { ensureUploadsStructure, uploadsRoot } from './lib/uploads';
import { errorHandler, notFound } from './middlewares/error';
import adminRoutes from './routes/admin.routes';
import { categories } from './routes/categories';
import { chat } from './routes/chat.routes';
import { customerAvatarRouter } from './routes/customerAvatar.routes';
import { customerLocationRoutes } from './routes/customerLocation.routes';
import customersMeRoutes from './routes/customersMe.routes';
import loginRoutes from './routes/login.routes';
import meRoutes from './routes/me.routes';
import { notificationsRouter } from './routes/notifications';
import { orderAttachments } from './routes/orderAttachments.routes';
import { orders, runAutoCancelExpiredPendingOrders } from './routes/orders.routes';
import passwordRoutes from './routes/password.routes';
import { profileRoutes } from './routes/profile.routes';
import registerRoutes from './routes/register.routes';
import seedRoutes from './routes/seed.routes';
import specialistAvatarRoutes from './routes/specialistAvatar.routes';
import { specialistsRoutes } from './routes/specialists.routes';
import { subscriptionsRouter } from './routes/subscriptions';

const app = express();

/** ================== Config ================== **/
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }),
);

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

/** ================== Rate limiting ================== **/
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/config',
});
app.use(limiter);

/** ================== Rate limiting (Auth Hardening) ================== **/
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20), // 20 intentos / 15 min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited' },
});

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_AUTH_RATE_LIMIT_MAX ?? 10), // más estricto
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited' },
});

// 🔒 aplicar SOLO a login endpoints
app.use('/auth/login', authLimiter);
app.use('/admin/auth/login', adminAuthLimiter);
app.use('/admin/seed', adminAuthLimiter);

/** ================== Parsers + CORS ================== **/
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
const isProd = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : !isProd,
    credentials: false,
    optionsSuccessStatus: 204,
  }),
);

app.options('*', cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : !isProd }));

/** ================== Static uploads (DEV/PROD) ================== **/
ensureUploadsStructure();
app.use('/uploads', express.static(uploadsRoot));
if (process.env.NODE_ENV !== 'production') {
  console.log('[static] uploadsRoot =', uploadsRoot);
}

// ✅ Fallback para rutas legacy /uploads/avatars/*
// (si el archivo no está en uploads/avatars, lo busca en otras rutas)
app.get('/uploads/avatars/:file', (req, res) => {
  const file = req.params.file;

  const candidates = [
    path.join(uploadsRoot, 'avatars', file), // uploads/avatars/file
    path.join(uploadsRoot, file), // uploads/file (raíz)
    path.join(uploadsRoot, 'customers', file), // uploads/customers/file (por si quedó viejo)
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[uploads-fallback] HIT', req.path, '->', p);
      }

      return res.sendFile(p);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[uploads-fallback] MISS', req.path, 'candidates=', candidates);
  }

  return res.status(404).end();
});

/** ================== Utilitarias ================== **/
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/config', (_req: Request, res: Response) => {
  res.json({ env: process.env.NODE_ENV ?? 'development', port: PORT });
});

app.get('/db', async (_req: Request, res: Response) => {
  try {
    const groups = await prisma.serviceCategoryGroup.count();
    const categoriesCount = await prisma.serviceCategory.count();
    const users = await prisma.user.count();
    res.json({ ok: true, groups, categories: categoriesCount, users });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('GET /db', error);
    res.status(500).json({ ok: false, error: 'Error al consultar DB' });
  }
});

/** ================== Módulos API ================== **/
app.use('/categories', categories);
app.use('/specialists', specialistsRoutes); // KYC + perfil + specialties
app.use('/specialists', specialistAvatarRoutes);
app.use('/customers/me/avatar', customerAvatarRouter);
app.use('/orders', orders);
app.use('/auth', registerRoutes);
app.use('/auth', meRoutes);
app.use('/auth', loginRoutes);
app.use('/chat', chat);
app.use('/auth', profileRoutes);
app.use('/notifications', notificationsRouter);
app.use('/subscriptions', subscriptionsRouter);
app.use('/customers', customerLocationRoutes);
app.use('/customers', customersMeRoutes);
app.use('/admin/seed', seedRoutes);
app.use('/admin', adminRoutes);
app.use('/auth', passwordRoutes);

// subida de adjuntos de órdenes
app.use(orderAttachments);

/** ================== 404 + errores ================== **/
app.use(notFound);
app.use(errorHandler);

/** ================== Auto-cancel job ================== **/
setInterval(() => {
  runAutoCancelExpiredPendingOrders().catch((e) => console.error('[autoCancel job] error', e));
}, 60_000);

/** ================== Boot ================== **/
async function boot() {
  try {
    if (process.env.QA_MODE === 'true') {
      console.log('[QA] Mode enabled → ensuring demo users...');
      await ensureQaUsers();
      console.log('[QA] Demo users ready');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API listening on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('[BOOT ERROR]', error);
    process.exit(1);
  }
}

boot();
