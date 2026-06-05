import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
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
trackingRouter.post(
  '/',
  authMiddleware,
  validate(createTrackingEventSchema),
  trackingController.create,
)

// ── Single event ───────────────────────────────────────────────────────────────
trackingRouter.get('/:id', authMiddleware, trackingController.getOne)

trackingRouter.patch(
  '/:id',
  authMiddleware,
  validate(updateTrackingEventSchema),
  trackingController.update,
)

trackingRouter.delete('/:id', authMiddleware, trackingController.remove)
