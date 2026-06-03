import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validate } from '../../lib/validate'
import {
  createQuotationSchema,
  updateQuotationSchema,
  listQuotationsQuerySchema,
} from './quotations.schema'
import * as ctrl from './quotations.controller'

export const quotationsRouter = Router()

quotationsRouter.get('/',              authMiddleware, validate(listQuotationsQuerySchema, 'query'), ctrl.list)
quotationsRouter.get('/:id',           authMiddleware, ctrl.getOne)
quotationsRouter.post('/',             authMiddleware, validate(createQuotationSchema), ctrl.create)
quotationsRouter.patch('/:id',         authMiddleware, validate(updateQuotationSchema), ctrl.update)
quotationsRouter.delete('/:id',        authMiddleware, ctrl.remove)
quotationsRouter.post('/:id/duplicate', authMiddleware, ctrl.duplicate)
quotationsRouter.post('/:id/pdf',      authMiddleware, ctrl.generatePdf)
