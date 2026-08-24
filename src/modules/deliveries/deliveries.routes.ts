import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission, requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createDeliverySchema,
  updateDeliverySchema,
  updateDeliveryStatusSchema,
  updateEtaSchema,
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

// Lean employee roster for the Assign picker — gated by 'deliveries.assign'
// itself, not 'employees.view' (HR access), so anyone allowed to assign a
// delivery can actually fetch who they're assigning it to. Must be declared
// before '/:id' below or Express would match "assignable-employees" as an id.
deliveriesRouter.get(
  '/assignable-employees',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.assign'),
  deliveriesController.listAssignableEmployees,
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

// ── ETA (any internal user) ───────────────────────────────────────────────────
// Deliberately not gated behind 'deliveries.edit' — the ETA is set by
// whichever Logical Links staff member has the update (ops, dispatch,
// support), same as the Status and Tracking Update actions below/above,
// none of which require the full-edit permission either.
deliveriesRouter.patch(
  '/:id/eta',
  authMiddleware,
  requireAdmin,
  validate(updateEtaSchema),
  deliveriesController.updateEta,
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
