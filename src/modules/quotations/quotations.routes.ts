import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requireRole, requireCompanyAdmin, requirePermission, requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createQuotationSchema,
  updateQuotationSchema,
  listQuotationsQuerySchema,
  acceptQuotationSchema,
  residentialQuoteRequestSchema,
  corporateQuoteRequestSchema,
} from './quotations.schema'
import * as ctrl from './quotations.controller'

export const quotationsRouter = Router()

// Mounted before "/:id" so the literal "stats"/"residential-quote"/"request"
// paths aren't captured as an id param.
quotationsRouter.get('/stats',          authMiddleware, requirePermissionIfAdmin('quotations.view'), ctrl.stats)

// ── Self-service quote request (customer workflow) ─────────────────────────────
quotationsRouter.post(
  '/residential-quote',
  authMiddleware,
  requireRole('residential'),
  validate(residentialQuoteRequestSchema),
  ctrl.createResidentialQuote,
)
quotationsRouter.post(
  '/request',
  authMiddleware,
  requireCompanyAdmin,
  validate(corporateQuoteRequestSchema),
  ctrl.createCorporateQuoteRequest,
)

quotationsRouter.get('/',              authMiddleware, requirePermissionIfAdmin('quotations.view'), validate(listQuotationsQuerySchema, 'query'), ctrl.list)
quotationsRouter.get('/:id',           authMiddleware, requirePermissionIfAdmin('quotations.view'), ctrl.getOne)
// Only System Admin authors quotations — shipping companies may only accept/decline them.
quotationsRouter.post('/',             authMiddleware, requireAdmin, requirePermission('quotations.create'), validate(createQuotationSchema), ctrl.create)
quotationsRouter.patch('/:id',         authMiddleware, requireAdmin, requirePermission('quotations.edit'), validate(updateQuotationSchema), ctrl.update)
quotationsRouter.delete('/:id',        authMiddleware, requireAdmin, requirePermission('quotations.delete'), ctrl.remove)
quotationsRouter.post('/:id/duplicate', authMiddleware, requireAdmin, requirePermission('quotations.create'), ctrl.duplicate)
quotationsRouter.post('/:id/pdf',      authMiddleware, ctrl.generatePdf)
quotationsRouter.post('/:id/accept',   authMiddleware, validate(acceptQuotationSchema), ctrl.accept)
quotationsRouter.post('/:id/decline',  authMiddleware, ctrl.decline)
// Residential-customer-only, ownership + status enforced inside the service
// (same pattern as accept/decline above) — not a role/permission check, so
// don't copy this route as a template for a new admin-only or money-moving
// action without adding one.
quotationsRouter.post('/:id/apply-rewards-credit', authMiddleware, ctrl.applyRewardsCredit)
