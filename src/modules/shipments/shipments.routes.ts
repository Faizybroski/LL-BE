import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createShipmentSchema,
  updateShipmentSchema,
  updateShipmentStatusSchema,
  deleteShipmentSchema,
  assignShipmentSchema,
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

shipmentsRouter.post(
  '/',
  authMiddleware,
  validate(createShipmentSchema),
  shipmentsController.create,
)

// ── Single resource ───────────────────────────────────────────────────────────
shipmentsRouter.get('/:id', authMiddleware, shipmentsController.getOne)

shipmentsRouter.patch(
  '/:id',
  authMiddleware,
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

// ── Assign to shipper (admin only) ────────────────────────────────────────────
// Shipment must be 'confirmed'; advances status to 'assigned'.
shipmentsRouter.post(
  '/:id/assign',
  authMiddleware,
  requireAdmin,
  validate(assignShipmentSchema),
  shipmentsController.assign,
)
