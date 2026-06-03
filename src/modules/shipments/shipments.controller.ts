import { Request, Response, NextFunction } from 'express'
import * as shipmentsService from './shipments.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  CreateShipmentDto,
  UpdateShipmentDto,
  UpdateShipmentStatusDto,
  DeleteShipmentDto,
  AssignShipmentDto,
  ListShipmentsQuery,
} from './shipments.schema'

const isAdmin = (req: Request) => req.user!.role === 'admin'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { shipments, total } = await shipmentsService.listShipments(
      req.query as unknown as ListShipmentsQuery,
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
    )
    paginated(res, shipments, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.getShipment(
      param(req, 'id'),
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
    )
    ok(res, shipment)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.createShipment(
      req.body as CreateShipmentDto,
      req.user!.id,
      req.user!.role,
    )
    created(res, shipment, 'Shipment created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.updateShipment(
      param(req, 'id'),
      req.body as UpdateShipmentDto,
      isAdmin(req),
      req.user!.accountId,
      req.user!.id,
    )
    ok(res, shipment, 'Shipment updated')
  } catch (err) {
    next(err)
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.updateStatus(
      param(req, 'id'),
      req.body as UpdateShipmentStatusDto,
      req.user!.id,
      isAdmin(req),
      req.user!.accountId,
    )
    ok(res, shipment, 'Status updated')
  } catch (err) {
    next(err)
  }
}

export async function assign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.assignToShipper(
      param(req, 'id'),
      req.body as AssignShipmentDto,
      req.user!.id,
    )
    ok(res, shipment, 'Shipper assigned')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await shipmentsService.deleteShipment(
      param(req, 'id'),
      req.body as DeleteShipmentDto,
      req.user!.id,
      isAdmin(req),
      req.user!.accountId,
    )
    noContent(res)
  } catch (err) {
    next(err)
  }
}
