import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { createServiceLevelSchema, updateServiceLevelSchema, serviceLevelIdSchema } from './service-levels.schema'
import * as controller from './service-levels.controller'

export const serviceLevelsRouter = Router()

// Public — used by the admin Pricing settings page as well as the customer-facing
// residential/corporate quote request forms to populate the Service Level dropdown.
serviceLevelsRouter.get('/', controller.list)

serviceLevelsRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(createServiceLevelSchema),
  controller.create,
)

serviceLevelsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(serviceLevelIdSchema, 'params'),
  validate(updateServiceLevelSchema),
  controller.update,
)

serviceLevelsRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(serviceLevelIdSchema, 'params'),
  controller.remove,
)
