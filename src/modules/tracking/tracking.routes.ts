import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createTrackingEventSchema,
  updateTrackingEventSchema,
  listTrackingEventsSchema,
} from './tracking.schema'
import * as trackingController from './tracking.controller'

export const trackingRouter = Router()

// ── Events for a specific load ─────────────────────────────────────────────────
trackingRouter.get(
  '/loads/:loadId/events',
  authMiddleware,
  validate(listTrackingEventsSchema, 'query'),
  trackingController.listByLoad,
)

// ── Collection (create) ────────────────────────────────────────────────────────
// Residential customers only ever read tracking events for their own load.
trackingRouter.post(
  '/',
  authMiddleware,
  requireRole('admin', 'shipper'),
  validate(createTrackingEventSchema),
  trackingController.create,
)

// ── Single event ───────────────────────────────────────────────────────────────
trackingRouter.get('/:id', authMiddleware, trackingController.getOne)

trackingRouter.patch(
  '/:id',
  authMiddleware,
  requireRole('admin', 'shipper'),
  validate(updateTrackingEventSchema),
  trackingController.update,
)

trackingRouter.delete('/:id', authMiddleware, requireRole('admin', 'shipper'), trackingController.remove)
