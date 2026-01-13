// apps/backend/src/schemas/orders.ts  (o donde lo tengas)
// ✅ actualizado para que note permita null en finish y confirm

import { z } from 'zod';

// Acepta tanto Cuid2 (cmg...) como Cuid clásico.
const id = z.string().cuid2().or(z.string().cuid());

export const createOrderSchema = z.object({
  customerId: id.optional(),
  specialistId: id.optional(),
  serviceId: id,
  locationId: id.optional(),
  description: z.string().min(1).max(2000).optional(),
  attachments: z
    .array(
      z.object({
        url: z.string().url(),
        type: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .optional(),

  preferredAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  isUrgent: z.boolean().default(false),
});

export const acceptOrderSchema = z.object({
  specialistId: id,
});

export const rescheduleOrderSchema = z.object({
  scheduledAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

export const finishOrderSchema = z.object({
  attachments: z.array(z.object({ url: z.string().url(), name: z.string().optional() })).optional(),
  // ✅ ahora permite string | null | undefined
  note: z.string().max(500).nullable().optional(),
});

export const confirmOrderSchema = z.object({
  // ✅ ahora permite string | null | undefined
  note: z.string().max(500).nullable().optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const cancelBySpecialistSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const rejectOrderSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

export const rateOrderSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type AcceptOrderInput = z.infer<typeof acceptOrderSchema>;
export type RescheduleOrderInput = z.infer<typeof rescheduleOrderSchema>;
export type FinishOrderInput = z.infer<typeof finishOrderSchema>;
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type CancelBySpecialistInput = z.infer<typeof cancelBySpecialistSchema>;
