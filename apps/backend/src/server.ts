// apps/backend/src/server.ts
import fs from 'fs';
import path from 'path';

import cors from 'cors';
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import { prisma } from './lib/prisma';
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

/** ================== Parsers + CORS ================== **/
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
    credentials: false,
    optionsSuccessStatus: 204,
  }),
);
app.options('*', cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true }));

/** ================== Static uploads (DEV/PROD) ================== **/
/**
 * ✅ Hotfix definitivo:
 * - NO usar __dirname (en prod apunta a dist/ y te rompe rutas)
 * - Servir /uploads desde process.cwd()/uploads (carpeta real)
 * - Y agregar fallback a process.cwd()/dist/uploads por compatibilidad
 */
const uploadsA = path.join(process.cwd(), 'uploads'); // apps/backend/uploads
const uploadsB = path.join(process.cwd(), 'dist', 'uploads'); // apps/backend/dist/uploads (fallback)

if (!fs.existsSync(uploadsA)) fs.mkdirSync(uploadsA, { recursive: true });
if (!fs.existsSync(uploadsB)) fs.mkdirSync(uploadsB, { recursive: true });

// primero A, luego B (si no existe en A, puede caer en B)
app.use('/uploads', express.static(uploadsA));
app.use('/uploads', express.static(uploadsB));

console.log('[static] /uploads serving A =', uploadsA, 'exists =', fs.existsSync(uploadsA));
console.log('[static] /uploads serving B =', uploadsB, 'exists =', fs.existsSync(uploadsB));

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
app.use('/admin', seedRoutes);
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
