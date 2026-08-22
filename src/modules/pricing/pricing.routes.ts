import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { calculatePriceSchema, updateWeightRateSchema } from './pricing.schema'
import * as pricingController from './pricing.controller'

export const pricingRouter = Router()

// Pure calculation against the global rates/charges — does not itself
// create a quotation. Used by admin's Pricing Calculator AND by both
// customer types' quote-request forms, so it's open to any authenticated
// user rather than admin-only; mutating the underlying rates/charges stays
// admin-only (see delivery-rates, additional-charges, weight-rate routes).
pricingRouter.post(
  '/calculate',
  authMiddleware,
  validate(calculatePriceSchema),
  pricingController.calculate,
)

pricingRouter.get(
  '/weight-rate',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.view'),
  pricingController.getWeightRate,
)

pricingRouter.patch(
  '/weight-rate',
  authMiddleware,
  requireAdmin,
  requirePermission('pricing.edit'),
  validate(updateWeightRateSchema),
  pricingController.updateWeightRate,
)
