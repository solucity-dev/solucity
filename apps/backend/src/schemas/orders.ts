// apps/backend/src/schemas/orders.ts
import { z } from 'zod';

// Acepta tanto Cuid2 (cmg...) como Cuid clásico.
const id = z.string().cuid2().or(z.string().cuid());

// ✅ URL ABSOLUTA o PATH relativo servido por tu backend (/uploads/...)
const fileUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('/uploads/') || /^https?:\/\/.+/i.test(v), 'invalid_url');

export const createOrderSchema = z.object({
  customerId: id.optional(),
  specialistId: id.optional(),
  serviceId: id,
  locationId: id.optional(),
  description: z.string().min(1).max(2000).optional(),
  attachments: z
    .array(
      z.object({
        url: fileUrl, // ✅ antes era z.string().url()
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
  attachments: z
    .array(
      z.object({
        url: fileUrl, // ✅ antes era z.string().url()
        name: z.string().optional(),
      }),
    )
    .optional(),
  note: z.string().max(500).nullable().optional(),
});

export const confirmOrderSchema = z.object({
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
  // ✅ permite vacío / undefined / null desde el mobile
  comment: z.string().max(1000).nullable().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type AcceptOrderInput = z.infer<typeof acceptOrderSchema>;
export type RescheduleOrderInput = z.infer<typeof rescheduleOrderSchema>;
export type FinishOrderInput = z.infer<typeof finishOrderSchema>;
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type CancelBySpecialistInput = z.infer<typeof cancelBySpecialistSchema>;
