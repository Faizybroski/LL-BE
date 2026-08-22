import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission, requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createDeliverySchema,
  updateDeliverySchema,
  updateDeliveryStatusSchema,
  deleteDeliverySchema,
  assignEmployeesSchema,
  listDeliveriesSchema,
} from './deliveries.schema'
import * as deliveriesController from './deliveries.controller'

export const deliveriesRouter = Router()

// ── Collection ────────────────────────────────────────────────────────────────
deliveriesRouter.get(
  '/',
  authMiddleware,
  requirePermissionIfAdmin('deliveries.view'),
  validate(listDeliveriesSchema, 'query'),
  deliveriesController.list,
)

// Only System Admin creates or operates deliveries — corporate customers
// are read-only on their own deliveries, never author or mutate them.
deliveriesRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.create'),
  validate(createDeliverySchema),
  deliveriesController.create,
)

// ── Single resource ───────────────────────────────────────────────────────────
deliveriesRouter.get('/:id', authMiddleware, requirePermissionIfAdmin('deliveries.view'), deliveriesController.getOne)

// Full delivery edits are admin-only — corporate customers use the
// status endpoint below instead.
deliveriesRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.edit'),
  validate(updateDeliverySchema),
  deliveriesController.update,
)

deliveriesRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.delete'),
  validate(deleteDeliverySchema),
  deliveriesController.remove,
)

// ── Status ────────────────────────────────────────────────────────────────────
// Admin-only — customers (residential and corporate) may view delivery status
// and history but never mutate it themselves.
deliveriesRouter.patch(
  '/:id/status',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.update_status'),
  validate(updateDeliveryStatusSchema),
  deliveriesController.updateStatus,
)

// ── Assign to Employees (admin only) ──────────────────────────────────────────
// Admin assigns a delivery internally to one or more Logical Links staff
// members at once (any active employee, not role-restricted) — replaces
// the old "assign to shipping company" action, which no longer makes sense
// now that corporate customers never operate a delivery themselves.
deliveriesRouter.post(
  '/:id/assign-employees',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.assign'),
  validate(assignEmployeesSchema),
  deliveriesController.assignEmployees,
)
