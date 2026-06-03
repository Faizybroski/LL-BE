import { Request, Response, NextFunction } from 'express'
import * as service from './invoices.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateInvoiceDto, UpdateInvoiceDto, ListInvoicesQuery } from './invoices.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { invoices, total } = await service.listInvoices(
      req.query as unknown as ListInvoicesQuery,
      req.user!.role,
      req.user!.id,
      req.user!.accountId,
    )
    paginated(res, invoices, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await service.getInvoice(param(req, 'id'), req.user!.role, req.user!.accountId)
    ok(res, invoice)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await service.createInvoice(req.body as CreateInvoiceDto, req.user!.id)
    created(res, invoice, 'Invoice created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await service.updateInvoice(
      param(req, 'id'),
      req.body as UpdateInvoiceDto,
      req.user!.role,
    )
    ok(res, invoice, 'Invoice updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteInvoice(param(req, 'id'), req.user!.role)
    noContent(res)
  } catch (err) {
    next(err)
  }
}

export async function duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await service.duplicateInvoice(param(req, 'id'), req.user!.id)
    created(res, invoice, 'Invoice duplicated')
  } catch (err) {
    next(err)
  }
}

export async function convertFromQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await service.convertFromQuotation(param(req, 'quotationId'), req.user!.id)
    created(res, invoice, 'Invoice created from quotation')
  } catch (err) {
    next(err)
  }
}

export async function generatePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.generatePdf(param(req, 'id'))
    ok(res, result, 'PDF generated')
  } catch (err) {
    next(err)
  }
}
