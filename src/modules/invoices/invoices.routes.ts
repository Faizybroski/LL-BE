import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
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
invoicesRouter.post('/',                                 authMiddleware, validate(createInvoiceSchema), ctrl.create)
invoicesRouter.patch('/:id',                             authMiddleware, validate(updateInvoiceSchema), ctrl.update)
invoicesRouter.delete('/:id',                            authMiddleware, ctrl.remove)
invoicesRouter.post('/:id/duplicate',                    authMiddleware, ctrl.duplicate)
invoicesRouter.post('/from-quotation/:quotationId',      authMiddleware, ctrl.convertFromQuotation)
invoicesRouter.post('/:id/pdf',                          authMiddleware, ctrl.generatePdf)
