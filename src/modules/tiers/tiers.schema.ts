import { z } from 'zod'

export const updateTierSchema = z.object({
  min_deliveries:   z.coerce.number().int().min(0).optional(),
  benefits:         z.array(z.string().min(1).max(200)).max(20).optional(),
  quote_turnaround: z.string().min(1).max(100).optional(),
})

export const tierIdSchema = z.object({
  id: z.string().uuid('Invalid tier ID'),
})

export type UpdateTierDto = z.infer<typeof updateTierSchema>
