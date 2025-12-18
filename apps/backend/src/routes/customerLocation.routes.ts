// apps/backend/src/routes/customerLocation.routes.ts
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { auth } from '../middlewares/auth'

export const customerLocationRoutes = Router()

// PATCH /customers/me/location
// Body: { lat: number, lng: number, formatted?: string }
const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  formatted: z.string().min(3).max(255).optional().nullable(),
})

customerLocationRoutes.patch('/me/location', auth, async (req, res) => {
  try {
    const userId = (req as any).user?.id as string | undefined
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }

    const parse = bodySchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        ok: false,
        error: parse.error.flatten(),
      })
    }
    const { lat, lng, formatted } = parse.data

    // 1) Buscar perfil de cliente + su dirección por defecto
    const customer = await prisma.customerProfile.findUnique({
      where: { userId },
      include: { defaultAddress: true },
    })

    if (!customer) {
      return res
        .status(404)
        .json({ ok: false, error: 'customer_profile_not_found' })
    }

    let address

    // 2) Si ya tiene defaultAddressId -> actualizar Address existente
    if (customer.defaultAddressId) {
      address = await prisma.address.update({
        where: { id: customer.defaultAddressId },
        data: {
          lat,
          lng,
          formatted: formatted ?? customer.defaultAddress?.formatted ?? '',
        },
      })
    } else {
      // 3) Si no tiene, crear una nueva Address
      address = await prisma.address.create({
        data: {
          lat,
          lng,
          formatted: formatted ?? '',
        },
      })

      // y setearla como default en el CustomerProfile
      await prisma.customerProfile.update({
        where: { id: customer.id },
        data: { defaultAddressId: address.id },
      })
    }

    return res.json({
      ok: true,
      address: {
        id: address.id,
        formatted: address.formatted,
        lat: address.lat,
        lng: address.lng,
      },
    })
  } catch (e) {
    console.error('PATCH /customers/me/location', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})
