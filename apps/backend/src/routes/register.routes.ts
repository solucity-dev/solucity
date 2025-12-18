// apps/backend/src/routes/register.routes.ts
import { Router } from 'express'
import { z } from 'zod'
import { signToken } from '../lib/jwt'
import { startEmailRegistration, verifyEmailRegistration } from '../services/register.service'

const router = Router()

// POST /auth/register/start { email }
router.post('/register/start', async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email() })
    const { email } = schema.parse(req.body)
    const result = await startEmailRegistration(email)
    return res.json({ ok: true, ...result })
  } catch (err: any) {
    // Respeta status custom si vino del servicio
    const status = err?.status ?? 500
    const msg = err?.message ?? 'server_error'

    // Normaliza errores conocidos
    if (msg === 'email_in_use') return res.status(409).json({ ok: false, error: 'email_in_use' })
    if (status !== 500) return res.status(status).json({ ok: false, error: msg })

    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

// POST /auth/register/verify { email, code, name, password, phone?, role? }
router.post('/register/verify', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().min(4).max(8),
      name: z.string().min(2),
      password: z.string().min(8),
      phone: z.string().min(6).max(25).optional().nullable(),
      role: z.enum(['CUSTOMER', 'SPECIALIST']).default('CUSTOMER'),
      // opcional: surname si lo usás
      surname: z.string().optional(),
    })

    const data = schema.parse(req.body)

    const user = await verifyEmailRegistration({
      email: data.email,
      code: data.code,
      name: data.name,
      password: data.password,
      phone: data.phone ?? null,
      role: data.role,
      // surname no está en VerifyArgs; si lo querés, guárdalo luego con un update.
    })

    const token = signToken({ sub: user.id, role: user.role })
    return res.json({ ok: true, user, token })
  } catch (err: any) {
    // === Normalización robusta de errores ===
    const status = err?.status ?? 500
    const msg = err?.message ?? 'server_error'

    // Errores de OTP conocidos => 400
    const otpErrors = new Set([
      'otp_not_found',
      'otp_already_used',
      'otp_blocked',
      'otp_expired',
      'otp_invalid',
    ])
    if (otpErrors.has(msg)) return res.status(400).json({ ok: false, error: msg })

    // Conflictos únicos => 409
    const conflicts = new Set(['email_in_use', 'phone_in_use', 'unique_violation'])
    if (conflicts.has(msg)) return res.status(409).json({ ok: false, error: msg })

    // Errores de validación de entrada => 400
    const badRequests = new Set(['weak_password'])
    if (badRequests.has(msg)) return res.status(400).json({ ok: false, error: msg })

    // Si el servicio definió status no-500, respétalo
    if (status !== 500) return res.status(status).json({ ok: false, error: msg })

    // Fallback
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

export default router





