import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { updateRewardsRuleSchema, rewardsRuleIdSchema } from './rewards.schema'
import * as rewardsController from './rewards.controller'

export const rewardsRouter = Router()

// Public — used by the admin Rewards page as well as the customer-facing quotation drawer.
rewardsRouter.get('/', rewardsController.list)

rewardsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('rewards.edit'),
  validate(rewardsRuleIdSchema, 'params'),
  validate(updateRewardsRuleSchema),
  rewardsController.update,
)
