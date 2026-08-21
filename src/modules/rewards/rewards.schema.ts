import { z } from 'zod'

export const updateRewardsRuleSchema = z.object({
  value: z.coerce.number().min(0).optional(),
})

export const rewardsRuleIdSchema = z.object({
  id: z.string().uuid('Invalid rewards rule ID'),
})

export type UpdateRewardsRuleDto = z.infer<typeof updateRewardsRuleSchema>
