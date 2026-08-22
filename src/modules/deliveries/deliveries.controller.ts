import { Request, Response, NextFunction } from 'express'
import * as deliveriesService from './deliveries.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeleteDeliveryDto,
  AssignEmployeesDto,
  ListDeliveriesQuery,
} from './deliveries.schema'

const isAdmin = (req: Request) => req.user!.role === 'admin'
const isResidential = (req: Request) => req.user!.role === 'residential'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { deliveries, total } = await deliveriesService.listDeliveries(
      req.query as unknown as ListDeliveriesQuery,
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
      req.user!.companyRole,
      isResidential(req),
    )
    paginated(res, deliveries, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const delivery = await deliveriesService.getDelivery(
      param(req, 'id'),
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
      req.user!.companyRole,
      isResidential(req),
    )
    ok(res, delivery)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const delivery = await deliveriesService.createDelivery(
      req.body as CreateDeliveryDto,
      req.user!.id,
      req.user!.role,
    )
    created(res, delivery, 'Delivery created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const delivery = await deliveriesService.updateDelivery(
      param(req, 'id'),
      req.body as UpdateDeliveryDto,
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
      req.user!.companyRole,
    )
    ok(res, delivery, 'Delivery updated')
  } catch (err) {
    next(err)
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const delivery = await deliveriesService.updateStatus(
      param(req, 'id'),
      req.body as UpdateDeliveryStatusDto,
      req.user!.id,
      isAdmin(req),
      req.user!.accountId,
      req.user!.companyRole,
    )
    ok(res, delivery, 'Status updated')
  } catch (err) {
    next(err)
  }
}

export async function assignEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const delivery = await deliveriesService.assignEmployees(
      param(req, 'id'),
      req.body as AssignEmployeesDto,
      req.user!.id,
    )
    ok(res, delivery, 'Employees assigned')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deliveriesService.deleteDelivery(
      param(req, 'id'),
      req.body as DeleteDeliveryDto,
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
