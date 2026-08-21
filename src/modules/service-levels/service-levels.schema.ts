import { z } from 'zod'

export const createServiceLevelSchema = z.object({
  slug:       z.string().min(1).max(50),
  label:      z.string().min(1).max(100),
  multiplier: z.coerce.number().min(0),
})

export const updateServiceLevelSchema = z.object({
  label:      z.string().min(1).max(100).optional(),
  multiplier: z.coerce.number().min(0).optional(),
  isActive:   z.boolean().optional(),
})

export const serviceLevelIdSchema = z.object({
  id: z.string().uuid('Invalid service level ID'),
})

export type CreateServiceLevelDto = z.infer<typeof createServiceLevelSchema>
export type UpdateServiceLevelDto = z.infer<typeof updateServiceLevelSchema>
