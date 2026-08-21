import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { createChargeSchema, updateChargeSchema, chargeIdSchema } from './additional-charges.schema'
import * as controller from './additional-charges.controller'

export const additionalChargesRouter = Router()

additionalChargesRouter.use(authMiddleware, requireAdmin, requirePermission('pricing.view'))

additionalChargesRouter.get('/', controller.list)

additionalChargesRouter.post(
  '/',
  requirePermission('pricing.edit'),
  validate(createChargeSchema),
  controller.create,
)

additionalChargesRouter.patch(
  '/:id',
  requirePermission('pricing.edit'),
  validate(chargeIdSchema, 'params'),
  validate(updateChargeSchema),
  controller.update,
)

additionalChargesRouter.delete(
  '/:id',
  requirePermission('pricing.edit'),
  validate(chargeIdSchema, 'params'),
  controller.remove,
)
