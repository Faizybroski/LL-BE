import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { updateTierSchema } from './tiers.schema'
import * as tiersController from './tiers.controller'

export const tiersRouter = Router()

// Public — used by the marketing /tiers page as well as the shipper dashboard.
tiersRouter.get('/', tiersController.list)

tiersRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('tiers.edit'),
  validate(updateTierSchema),
  tiersController.update,
)
