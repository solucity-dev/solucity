import { PrismaClient } from '@prisma/client'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'

// Side effects (dotenv)
import 'dotenv/config'

import { errorHandler, notFound } from './middlewares/error'

const app = express()
const prisma = new PrismaClient()

// Config
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Seguridad y utilidades base
app.set('trust proxy', 1)
app.use(helmet())

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

// Rate limiting
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000) // 1 min
const max = Number(process.env.RATE_LIMIT_MAX ?? 100)

app.use(
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

// Body + CORS
app.use(express.json())
app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
  }),
)

// Rutas
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, uptime: process.uptime() })
})

app.get('/config', (_req: Request, res: Response) => {
  res.json({
    env: process.env.NODE_ENV ?? 'development',
    port: PORT,
  })
})

app.get('/db', async (_req: Request, res: Response) => {
  try {
    const count = await prisma.placeholder.count()
    res.json({ ok: true, placeholders: count })
  } catch (error) {
    // usamos el error para evitar "unused var" y dejar un log útil en dev
    if (process.env.NODE_ENV !== 'production') console.error('GET /db', error)
    res.status(500).json({ ok: false, error: 'Error al consultar DB' })
  }
})

app.post('/db/add', async (req: Request, res: Response) => {
  try {
    const { name } = req.body ?? {}
    if (!name) return res.status(400).json({ ok: false, error: 'Falta "name"' })

    const nuevo = await prisma.placeholder.create({ data: { name } })
    res.status(201).json({ ok: true, nuevo })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('POST /db/add', error)
    res.status(500).json({ ok: false, error: 'Error al insertar en DB' })
  }
})

// 404 y errores
app.use(notFound)
app.use(errorHandler)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`)
})
