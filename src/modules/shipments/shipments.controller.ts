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
  AssignEmployeeDto,
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
      req.user!.companyRole,
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
      req.user!.companyRole,
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
      req.user!.companyRole,
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
      req.user!.companyRole,
    )
    ok(res, shipment, 'Status updated')
  } catch (err) {
    next(err)
  }
}

export async function assign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.assignToCompany(
      param(req, 'id'),
      req.body as AssignShipmentDto,
      req.user!.id,
    )
    ok(res, shipment, 'Shipping company assigned')
  } catch (err) {
    next(err)
  }
}

export async function assignEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shipment = await shipmentsService.assignToEmployee(
      param(req, 'id'),
      req.body as AssignEmployeeDto,
      req.user!.id,
      req.user!.accountId!,
    )
    ok(res, shipment, 'Employee assigned')
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
      req.user!.companyRole,
    )
    noContent(res)
  } catch (err) {
    next(err)
  }
}
