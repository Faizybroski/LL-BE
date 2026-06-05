import { Request, Response, NextFunction } from 'express'
import * as trackingService from './tracking.service'
import { ok, created, noContent, paginated } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  CreateTrackingEventDto,
  UpdateTrackingEventDto,
  ListTrackingEventsQuery,
} from './tracking.schema'

const isAdmin = (req: Request) => req.user!.role === 'admin'

export async function listByLoad(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const loadId = param(req, 'loadId')
    const query  = req.query as unknown as ListTrackingEventsQuery
    const { events, total } = await trackingService.listEvents(
      loadId,
      query,
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
      req.user!.companyRole,
    )
    paginated(res, events, {
      page:       query.page  ?? 1,
      limit:      query.limit ?? 50,
      total,
      totalPages: Math.ceil(total / (query.limit ?? 50)),
    })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await trackingService.getEvent(
      param(req, 'id'),
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
      req.user!.companyRole,
    )
    ok(res, event)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await trackingService.createEvent(
      req.body as CreateTrackingEventDto,
      req.user!.id,
      isAdmin(req),
      req.user!.accountId,
      req.user!.companyRole,
    )
    created(res, event, 'Tracking event created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await trackingService.updateEvent(
      param(req, 'id'),
      req.body as UpdateTrackingEventDto,
      req.user!.id,
      isAdmin(req),
      req.user!.accountId,
      req.user!.companyRole,
    )
    ok(res, event, 'Tracking event updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await trackingService.deleteEvent(
      param(req, 'id'),
      req.user!.id,
      isAdmin(req),
      req.user!.accountId,
      req.user!.companyRole,
    )
    noContent(res)
  } catch (err) {
    next(err)
  }
}
