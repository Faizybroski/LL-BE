import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createQuotationSchema,
  updateQuotationSchema,
  listQuotationsQuerySchema,
  acceptQuotationSchema,
} from './quotations.schema'
import * as ctrl from './quotations.controller'

export const quotationsRouter = Router()

// Mounted before "/:id" so the literal "stats" path isn't captured as an id param.
quotationsRouter.get('/stats',          authMiddleware, ctrl.stats)

quotationsRouter.get('/',              authMiddleware, validate(listQuotationsQuerySchema, 'query'), ctrl.list)
quotationsRouter.get('/:id',           authMiddleware, ctrl.getOne)
// Only System Admin authors quotations — shipping companies may only accept/decline them.
quotationsRouter.post('/',             authMiddleware, requireAdmin, validate(createQuotationSchema), ctrl.create)
quotationsRouter.patch('/:id',         authMiddleware, requireAdmin, validate(updateQuotationSchema), ctrl.update)
quotationsRouter.delete('/:id',        authMiddleware, requireAdmin, ctrl.remove)
quotationsRouter.post('/:id/duplicate', authMiddleware, requireAdmin, ctrl.duplicate)
quotationsRouter.post('/:id/pdf',      authMiddleware, ctrl.generatePdf)
quotationsRouter.post('/:id/accept',   authMiddleware, validate(acceptQuotationSchema), ctrl.accept)
quotationsRouter.post('/:id/decline',  authMiddleware, ctrl.decline)
