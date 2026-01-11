// apps/backend/src/routes/register.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { signToken } from '../lib/jwt';
import { startEmailRegistration, verifyEmailRegistration } from '../services/register.service';

const router = Router();

/**
 * Helpers
 */
function zodDetails(err: any) {
  if (err?.name === 'ZodError' && Array.isArray(err?.issues)) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of err.issues) {
      const key = (i.path?.[0] as string) ?? 'form';
      fieldErrors[key] = fieldErrors[key] ?? [];
      fieldErrors[key].push(i.message);
    }
    return { fieldErrors, formErrors: [] as string[] };
  }
  return undefined;
}

/**
 * Heurística: si viene "Nombre Apellido" en `name` y no viene `surname`,
 * separamos en nombre + apellido.
 *
 * - "Ana Pérez" => name="Ana", surname="Pérez"
 * - "Juan Pablo Pérez" => name="Juan Pablo", surname="Pérez"
 * - Maneja partículas comunes: "De", "Del", "De la", "Van", "Von", etc.
 */
function splitFullName(input: string): { name: string; surname?: string } {
  const t = input.trim().replace(/\s+/g, ' ');
  const parts = t.split(' ').filter(Boolean);

  if (parts.length < 2) return { name: t };

  const particles = new Set([
    'de',
    'del',
    'la',
    'las',
    'los',
    'da',
    'do',
    'dos',
    'das',
    'van',
    'von',
    'y',
  ]);

  // Intento: si el último token es apellido simple => ok.
  // Si hay partículas antes del último token, las sumamos al apellido.
  let idxSurnameStart = parts.length - 1;

  // ejemplo: "Juan De la Cruz" => apellido "De la Cruz"
  // parts: [Juan, De, la, Cruz]
  // retrocedemos mientras encontremos partículas antes del último apellido
  let i = parts.length - 2;
  while (i >= 1 && particles.has(parts[i].toLowerCase())) {
    idxSurnameStart = i;
    i--;
  }

  const nameParts = parts.slice(0, idxSurnameStart);
  const surnameParts = parts.slice(idxSurnameStart);

  const name = nameParts.join(' ').trim();
  const surname = surnameParts.join(' ').trim();

  if (!name) return { name: t }; // fallback seguro
  if (!surname) return { name };

  return { name, surname };
}

/**
 * POST /auth/register/start
 * body: { email }
 */
router.post('/register/start', async (req, res) => {
  try {
    const schema = z.object({
      email: z
        .string()
        .email()
        .transform((v) => v.trim().toLowerCase()),
    });

    const { email } = schema.parse(req.body);

    const result = await startEmailRegistration(email);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const msg = err?.message ?? 'server_error';

    if (err?.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: zodDetails(err) });
    }

    if (msg === 'email_in_use') {
      return res.status(409).json({ ok: false, error: 'email_in_use' });
    }

    if (msg === 'too_many_requests') {
      return res.status(429).json({ ok: false, error: 'too_many_requests' });
    }

    if (status !== 500) {
      return res.status(status).json({ ok: false, error: msg });
    }

    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /auth/register/verify
 * body: { email, code, name, password, phone?, role?, surname? }
 *
 * - Acepta surname opcional.
 * - Si surname NO viene, pero name trae "Nombre Apellido", se separa.
 */
router.post('/register/verify', async (req, res) => {
  try {
    const schema = z.object({
      email: z
        .string()
        .email()
        .transform((v) => v.trim().toLowerCase()),
      code: z
        .string()
        .regex(/^\d{6}$/, 'El código debe tener 6 dígitos.')
        .transform((v) => v.trim()),

      // OJO: acá puede venir "Nombre Apellido" (cliente) o solo "Nombre" (especialista)
      name: z
        .string()
        .min(2)
        .transform((v) => v.trim()),

      password: z.string().min(8),

      // phone: si viene vacío => null
      phone: z
        .string()
        .trim()
        .min(6)
        .max(25)
        .optional()
        .nullable()
        .transform((v) => {
          const t = (v ?? '').trim();
          return t.length ? t : null;
        }),

      role: z.enum(['CUSTOMER', 'SPECIALIST']).default('CUSTOMER'),

      // ✅ surname: normalizado. Si llega "" o "   " => undefined
      surname: z
        .string()
        .optional()
        .transform((v) => {
          const t = (v ?? '').trim();
          return t.length >= 2 ? t : undefined;
        }),
    });

    const data = schema.parse(req.body);

    // ✅ Si no viene surname pero name tiene más de 1 palabra, separamos (para RegisterClient)
    let finalName = data.name;
    let finalSurname = data.surname;

    if (!finalSurname) {
      const split = splitFullName(data.name);
      finalName = split.name;
      finalSurname = split.surname ?? undefined;
    }

    const user = await verifyEmailRegistration({
      email: data.email,
      code: data.code,
      name: finalName,
      surname: finalSurname,
      password: data.password,
      phone: data.phone ?? null,
      role: data.role,
    });

    const token = signToken({ sub: user.id, role: user.role });
    return res.json({ ok: true, user, token });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const msg = err?.message ?? 'server_error';

    if (err?.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: 'invalid_input', details: zodDetails(err) });
    }

    const otpErrors400 = new Set([
      'otp_not_found',
      'otp_already_used',
      'otp_expired',
      'otp_invalid',
    ]);
    if (otpErrors400.has(msg)) return res.status(400).json({ ok: false, error: msg });

    if (msg === 'otp_blocked') return res.status(429).json({ ok: false, error: 'otp_blocked' });

    const conflicts = new Set(['email_in_use', 'phone_in_use', 'unique_violation']);
    if (conflicts.has(msg)) return res.status(409).json({ ok: false, error: msg });

    const badRequests = new Set(['weak_password']);
    if (badRequests.has(msg)) return res.status(400).json({ ok: false, error: msg });

    if (status !== 500) return res.status(status).json({ ok: false, error: msg });

    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
