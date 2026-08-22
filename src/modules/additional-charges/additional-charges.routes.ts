import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { createChargeSchema, updateChargeSchema, chargeIdSchema } from './additional-charges.schema'
import * as controller from './additional-charges.controller'

export const additionalChargesRouter = Router()

// Any authenticated user (admin or customer) can read the global charge
// list — both the admin Pricing Calculator and the customer quote-request
// forms need the same options with the same prices. Only mutating them
// stays admin-only.
additionalChargesRouter.get('/', authMiddleware, controller.list)

additionalChargesRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(createChargeSchema),
  controller.create,
)

additionalChargesRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(chargeIdSchema, 'params'),
  validate(updateChargeSchema),
  controller.update,
)

additionalChargesRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(chargeIdSchema, 'params'),
  controller.remove,
)
