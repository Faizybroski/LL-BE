import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { createDeliveryRateSchema, updateDeliveryRateSchema, deliveryRateIdSchema } from './delivery-rates.schema'
import * as controller from './delivery-rates.controller'

export const deliveryRatesRouter = Router()

// Public — used by the admin Pricing settings page as well as the customer-facing
// residential/corporate quote request forms to populate the Service Type dropdown.
deliveryRatesRouter.get('/', controller.list)

deliveryRatesRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(createDeliveryRateSchema),
  controller.create,
)

deliveryRatesRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(deliveryRateIdSchema, 'params'),
  validate(updateDeliveryRateSchema),
  controller.update,
)

deliveryRatesRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(deliveryRateIdSchema, 'params'),
  controller.remove,
)
