import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole, requirePermission } from '../../middleware/role.middleware'
import * as controller from './rewards-credit.controller'

export const rewardsCreditRouter = Router()

rewardsCreditRouter.get('/summary', authMiddleware, controller.getMySummary)
rewardsCreditRouter.get('/history', authMiddleware, controller.getMyHistory)

// Admin: read a residential customer's rewards balance + ledger for their
// profile page. Same gate as the rest of the residential-customer admin views.
rewardsCreditRouter.get(
  '/customers/:profileId/summary',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.view'),
  controller.getCustomerSummary,
)
rewardsCreditRouter.get(
  '/customers/:profileId/history',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.view'),
  controller.getCustomerHistory,
)
