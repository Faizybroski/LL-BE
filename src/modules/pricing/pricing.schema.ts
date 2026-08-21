import { z } from 'zod'

export const calculatePriceSchema = z.object({
  serviceType:          z.string().min(1),
  serviceLevel:         z.string().min(1).default('standard'),
  distanceKm:           z.coerce.number().min(0),
  weightKg:             z.coerce.number().min(0).optional(),
  additionalChargeKeys: z.array(z.string()).default([]),
})

export const updateWeightRateSchema = z.object({
  value: z.coerce.number().min(0),
})

export type CalculatePriceDto     = z.infer<typeof calculatePriceSchema>
export type UpdateWeightRateDto   = z.infer<typeof updateWeightRateSchema>
