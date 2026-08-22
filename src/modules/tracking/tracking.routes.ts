import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createTrackingEventSchema,
  updateTrackingEventSchema,
  listTrackingEventsSchema,
} from './tracking.schema'
import * as trackingController from './tracking.controller'

export const trackingRouter = Router()

// ── Events for a specific delivery ─────────────────────────────────────────────────
trackingRouter.get(
  '/deliveries/:loadId/events',
  authMiddleware,
  validate(listTrackingEventsSchema, 'query'),
  trackingController.listByDelivery,
)

// ── Collection (create) ────────────────────────────────────────────────────────
// Tracking history is Logical Links staff-only, gated by the same
// CEO-configurable "deliveries.update_status" permission as delivery status
// changes — customers (residential and corporate) may only ever read it.
trackingRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.update_status'),
  validate(createTrackingEventSchema),
  trackingController.create,
)

// ── Single event ───────────────────────────────────────────────────────────────
trackingRouter.get('/:id', authMiddleware, trackingController.getOne)

trackingRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.update_status'),
  validate(updateTrackingEventSchema),
  trackingController.update,
)

trackingRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('deliveries.update_status'),
  trackingController.remove,
)
