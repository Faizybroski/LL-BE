import { z } from 'zod'

export const createDeliveryRateSchema = z.object({
  serviceType:   z.string().min(1).max(50),
  label:         z.string().min(1).max(100),
  baseFee:       z.coerce.number().min(0),
  perKmRate:     z.coerce.number().min(0),
  minimumCharge: z.coerce.number().min(0),
})

export const updateDeliveryRateSchema = z.object({
  label:         z.string().min(1).max(100).optional(),
  baseFee:       z.coerce.number().min(0).optional(),
  perKmRate:     z.coerce.number().min(0).optional(),
  minimumCharge: z.coerce.number().min(0).optional(),
  isActive:      z.boolean().optional(),
})

export const deliveryRateIdSchema = z.object({
  id: z.string().uuid('Invalid delivery rate ID'),
})

export type CreateDeliveryRateDto = z.infer<typeof createDeliveryRateSchema>
export type UpdateDeliveryRateDto = z.infer<typeof updateDeliveryRateSchema>
