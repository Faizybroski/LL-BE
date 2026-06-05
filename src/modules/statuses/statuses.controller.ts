import { Request, Response, NextFunction } from 'express'
import * as statusesService from './statuses.service'
import { ok, created, noContent, paginated } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateStatusDto, UpdateStatusDto, ListStatusesQuery } from './statuses.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListStatusesQuery
    const { statuses, total } = await statusesService.listStatuses(query)
    paginated(res, statuses, {
      page:       query.page  ?? 1,
      limit:      query.limit ?? 100,
      total,
      totalPages: Math.ceil(total / (query.limit ?? 100)),
    })
  } catch (err) {
    next(err)
  }
}

export async function listAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const statuses = await statusesService.listAllActiveStatuses()
    ok(res, statuses)
  } catch (err) {
    next(err)
  }
}

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = String(req.query.q ?? '').slice(0, 100)
    const statuses = await statusesService.searchStatuses(q)
    ok(res, statuses)
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = await statusesService.getStatus(param(req, 'id'))
    ok(res, status)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = await statusesService.createStatus(req.body as CreateStatusDto)
    created(res, status, 'Status created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = await statusesService.updateStatus(param(req, 'id'), req.body as UpdateStatusDto)
    ok(res, status, 'Status updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await statusesService.deleteStatus(param(req, 'id'))
    noContent(res)
  } catch (err) {
    next(err)
  }
}
