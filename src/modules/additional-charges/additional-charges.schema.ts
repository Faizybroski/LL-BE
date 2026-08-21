import { z } from 'zod'

export const createChargeSchema = z.object({
  key:      z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores only'),
  category: z.string().min(1).max(50),
  label:    z.string().min(1).max(100),
  amount:   z.coerce.number().min(0).optional(),
  unit:     z.enum(['flat', 'per_hour', 'per_stop', 'per_km']).default('flat'),
  purpose:  z.string().max(300).optional(),
})

export const updateChargeSchema = z.object({
  label:    z.string().min(1).max(100).optional(),
  amount:   z.coerce.number().min(0).optional(),
  unit:     z.enum(['flat', 'per_hour', 'per_stop', 'per_km']).optional(),
  purpose:  z.string().max(300).optional(),
  isActive: z.boolean().optional(),
})

export const chargeIdSchema = z.object({
  id: z.string().uuid('Invalid charge ID'),
})

export type CreateChargeDto = z.infer<typeof createChargeSchema>
export type UpdateChargeDto = z.infer<typeof updateChargeSchema>
