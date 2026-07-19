import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requireCompanyAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createShipmentSchema,
  updateShipmentSchema,
  updateShipmentStatusSchema,
  deleteShipmentSchema,
  assignShipmentSchema,
  assignEmployeeSchema,
  listShipmentsSchema,
} from './shipments.schema'
import * as shipmentsController from './shipments.controller'

export const shipmentsRouter = Router()

// ── Collection ────────────────────────────────────────────────────────────────
shipmentsRouter.get(
  '/',
  authMiddleware,
  validate(listShipmentsSchema, 'query'),
  shipmentsController.list,
)

// Only System Admin creates deliveries — shipping companies may update
// status/location/employee on existing loads but never author new ones.
shipmentsRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  validate(createShipmentSchema),
  shipmentsController.create,
)

// ── Single resource ───────────────────────────────────────────────────────────
shipmentsRouter.get('/:id', authMiddleware, shipmentsController.getOne)

// Full delivery edits are admin-only — shipping companies use the
// status/assign-employee endpoints below instead.
shipmentsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  validate(updateShipmentSchema),
  shipmentsController.update,
)

shipmentsRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  validate(deleteShipmentSchema),
  shipmentsController.remove,
)

// ── Status ────────────────────────────────────────────────────────────────────
shipmentsRouter.patch(
  '/:id/status',
  authMiddleware,
  validate(updateShipmentStatusSchema),
  shipmentsController.updateStatus,
)

// ── Assign to Shipping Company (admin only) ───────────────────────────────────
// Shipment must be 'confirmed'; advances status to 'assigned'.
shipmentsRouter.post(
  '/:id/assign',
  authMiddleware,
  requireAdmin,
  validate(assignShipmentSchema),
  shipmentsController.assign,
)

// ── Assign to Employee (company admin only) ───────────────────────────────────
// Company admin assigns (or unassigns) a load to an employee within their company.
shipmentsRouter.post(
  '/:id/assign-employee',
  authMiddleware,
  requireCompanyAdmin,
  validate(assignEmployeeSchema),
  shipmentsController.assignEmployee,
)
