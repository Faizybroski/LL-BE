import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesQuerySchema,
} from './invoices.schema'
import * as ctrl from './invoices.controller'

export const invoicesRouter = Router()

invoicesRouter.get('/',                                  authMiddleware, validate(listInvoicesQuerySchema, 'query'), ctrl.list)
invoicesRouter.get('/:id',                               authMiddleware, ctrl.getOne)
// Only System Admin authors invoices — shipping companies may only view, accept/decline, and download PDFs.
invoicesRouter.post('/',                                 authMiddleware, requireAdmin, validate(createInvoiceSchema), ctrl.create)
invoicesRouter.patch('/:id',                             authMiddleware, requireAdmin, validate(updateInvoiceSchema), ctrl.update)
invoicesRouter.delete('/:id',                            authMiddleware, requireAdmin, ctrl.remove)
invoicesRouter.post('/:id/duplicate',                    authMiddleware, requireAdmin, ctrl.duplicate)
invoicesRouter.post('/from-quotation/:quotationId',      authMiddleware, requireAdmin, ctrl.convertFromQuotation)
invoicesRouter.post('/:id/pdf',                          authMiddleware, ctrl.generatePdf)
