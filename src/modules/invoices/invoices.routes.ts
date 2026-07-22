import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission, requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesQuerySchema,
} from './invoices.schema'
import * as ctrl from './invoices.controller'

export const invoicesRouter = Router()

invoicesRouter.get('/',                                  authMiddleware, requirePermissionIfAdmin('invoices.view'), validate(listInvoicesQuerySchema, 'query'), ctrl.list)
invoicesRouter.get('/:id',                               authMiddleware, requirePermissionIfAdmin('invoices.view'), ctrl.getOne)
// Only System Admin authors invoices — shipping companies may only view, accept/decline, and download PDFs.
invoicesRouter.post('/',                                 authMiddleware, requireAdmin, requirePermission('invoices.create'), validate(createInvoiceSchema), ctrl.create)
invoicesRouter.patch('/:id',                             authMiddleware, requireAdmin, requirePermission('invoices.edit'), validate(updateInvoiceSchema), ctrl.update)
invoicesRouter.delete('/:id',                            authMiddleware, requireAdmin, requirePermission('invoices.delete'), ctrl.remove)
invoicesRouter.post('/:id/duplicate',                    authMiddleware, requireAdmin, requirePermission('invoices.create'), ctrl.duplicate)
invoicesRouter.post('/from-quotation/:quotationId',      authMiddleware, requireAdmin, requirePermission('invoices.create'), ctrl.convertFromQuotation)
invoicesRouter.post('/:id/pdf',                          authMiddleware, ctrl.generatePdf)
