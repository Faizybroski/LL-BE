import { Request, Response, NextFunction } from 'express'
import * as service from './quotations.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  CreateQuotationDto,
  UpdateQuotationDto,
  ListQuotationsQuery,
  AcceptQuotationDto,
  ResidentialQuoteRequestDto,
  CorporateQuoteRequestDto,
} from './quotations.schema'

// IP + User-Agent for the acceptance audit trail — mirrors auth.controller's requestContext.
function requestContext(req: Request) {
  return {
    ipAddress: (req.ip ?? req.socket.remoteAddress) as string | undefined,
    userAgent: req.get('User-Agent'),
  }
}

export async function stats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.getQuotationStats(
      req.user!.role,
      req.user!.id,
      req.user!.accountId,
    )
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { quotations, total } = await service.listQuotations(
      req.query as unknown as ListQuotationsQuery,
      req.user!.role,
      req.user!.id,
      req.user!.accountId,
    )
    paginated(res, quotations, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.getQuotation(
      param(req, 'id'),
      req.user!.role,
      req.user!.accountId,
      req.user!.id,
    )
    ok(res, quotation)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.createQuotation(req.body as CreateQuotationDto, req.user!.id)
    created(res, quotation, 'Quotation created')
  } catch (err) {
    next(err)
  }
}

export async function createResidentialQuote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.createResidentialQuote(
      req.user!.id,
      req.user!.email,
      req.body as ResidentialQuoteRequestDto,
    )
    created(res, quotation, 'Quote generated')
  } catch (err) {
    next(err)
  }
}

export async function createCorporateQuoteRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.createCorporateQuoteRequest(
      req.user!.id,
      req.user!.accountId as string,
      req.body as CorporateQuoteRequestDto,
    )
    created(res, quotation, 'Quote request submitted')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.updateQuotation(
      param(req, 'id'),
      req.body as UpdateQuotationDto,
      req.user!.role,
      req.user!.id,
      req.user!.companyRole,
      req.user!.accountId,
    )
    ok(res, quotation, 'Quotation updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteQuotation(
      param(req, 'id'),
      req.user!.role,
      req.user!.id,
      req.user!.companyRole,
      req.user!.accountId,
    )
    noContent(res)
  } catch (err) {
    next(err)
  }
}

export async function duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.duplicateQuotation(param(req, 'id'), req.user!.id)
    created(res, quotation, 'Quotation duplicated')
  } catch (err) {
    next(err)
  }
}

export async function generatePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.generatePdf(
      param(req, 'id'),
      req.user!.role,
      req.user!.accountId,
      req.user!.id,
    )
    ok(res, result, 'PDF generated')
  } catch (err) {
    next(err)
  }
}

export async function accept(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.acceptQuotation(
      param(req, 'id'),
      req.body as AcceptQuotationDto,
      req.user!.id,
      req.user!.role,
      req.user!.companyRole,
      req.user!.accountId,
      requestContext(req),
    )
    ok(res, quotation, 'Quotation accepted')
  } catch (err) {
    next(err)
  }
}

export async function decline(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quotation = await service.declineQuotation(
      param(req, 'id'),
      req.user!.id,
      req.user!.role,
      req.user!.companyRole,
      req.user!.accountId,
    )
    ok(res, quotation, 'Quotation declined')
  } catch (err) {
    next(err)
  }
}

export async function applyRewardsCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.applyRewardsCredit(param(req, 'id'), req.user!.id, req.user!.role)
    ok(res, result, 'Rewards Credit applied')
  } catch (err) {
    next(err)
  }
}
