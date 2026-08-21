import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission, requirePermissionIfAdmin, requireRole } from '../../middleware/role.middleware'
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
  requirePermissionIfAdmin('deliveries.view'),
  validate(listShipmentsSchema, 'query'),
  shipmentsController.list,
)

// Only System Admin creates deliveries — shipping companies may update
// status/location/employee on existing loads but never author new ones.
shipmentsRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.create'),
  validate(createShipmentSchema),
  shipmentsController.create,
)

// ── Single resource ───────────────────────────────────────────────────────────
shipmentsRouter.get('/:id', authMiddleware, requirePermissionIfAdmin('deliveries.view'), shipmentsController.getOne)

// Full delivery edits are admin-only — corporate customers use the
// status endpoint below instead.
shipmentsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.edit'),
  validate(updateShipmentSchema),
  shipmentsController.update,
)

shipmentsRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.delete'),
  validate(deleteShipmentSchema),
  shipmentsController.remove,
)

// ── Status ────────────────────────────────────────────────────────────────────
// Residential customers may view but never mutate shipment status.
shipmentsRouter.patch(
  '/:id/status',
  authMiddleware,
  requireRole('admin', 'shipper'),
  validate(updateShipmentStatusSchema),
  shipmentsController.updateStatus,
)

// ── Assign to Shipping Company (admin only) ───────────────────────────────────
// Shipment must be 'confirmed'; advances status to 'assigned'.
shipmentsRouter.post(
  '/:id/assign',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.assign'),
  validate(assignShipmentSchema),
  shipmentsController.assign,
)

// ── Assign to Driver (platform admin only) ────────────────────────────────────
// Admin assigns (or unassigns) a delivery to one of Logical Links' own drivers.
shipmentsRouter.post(
  '/:id/assign-driver',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.assign'),
  validate(assignEmployeeSchema),
  shipmentsController.assignDriver,
)
