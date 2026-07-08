import { Request, Response, NextFunction } from 'express'
import * as service from './support.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  CreateCaseDto,
  UpdateCaseStatusDto,
  UpdateCaseDto,
  CreateCommentDto,
  ListCasesQuery,
  AttachmentUploadUrlDto,
  ConfirmAttachmentDto,
} from './support.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { cases, total } = await service.listCases(
      req.query as unknown as ListCasesQuery,
      req.user!.role,
      req.user!.id,
    )
    paginated(res, cases, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.getCase(param(req, 'id'), req.user!.role, req.user!.id)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.createCase(req.body as CreateCaseDto, req.user!.id, req.user!.role)
    created(res, result, 'Support case created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.updateCase(
      param(req, 'id'),
      req.body as UpdateCaseDto,
      req.user!.id,
      req.user!.role,
    )
    ok(res, result, 'Support case updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteCase(param(req, 'id'), req.user!.role)
    noContent(res)
  } catch (err) {
    next(err)
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.updateCaseStatus(param(req, 'id'), req.body as UpdateCaseStatusDto, req.user!.role)
    ok(res, result, 'Case status updated')
  } catch (err) {
    next(err)
  }
}

export async function addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.addComment(
      param(req, 'id'),
      req.body as CreateCommentDto,
      req.user!.id,
      req.user!.role,
    )
    created(res, result, 'Comment added')
  } catch (err) {
    next(err)
  }
}

export async function attachmentUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.getAttachmentUploadUrl(
      param(req, 'id'),
      req.body as AttachmentUploadUrlDto,
      req.user!.id,
      req.user!.role,
    )
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

export async function confirmAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.confirmAttachment(
      param(req, 'id'),
      req.body as ConfirmAttachmentDto,
      req.user!.id,
      req.user!.role,
    )
    created(res, result, 'Attachment added')
  } catch (err) {
    next(err)
  }
}
