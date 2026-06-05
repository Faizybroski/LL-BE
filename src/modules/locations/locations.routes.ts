import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createLocationSchema,
  updateLocationSchema,
  listLocationsSchema,
} from './locations.schema'
import * as locationsController from './locations.controller'

export const locationsRouter = Router()

// All authenticated users can list / search (needed for the tracking form dropdown)
locationsRouter.get(
  '/',
  authMiddleware,
  validate(listLocationsSchema, 'query'),
  locationsController.list,
)

locationsRouter.get(
  '/search',
  authMiddleware,
  locationsController.search,
)

locationsRouter.get('/:id', authMiddleware, locationsController.getOne)

// Admin-only mutations
locationsRouter.post(
  '/',
  authMiddleware,
  validate(createLocationSchema),
  locationsController.create,
)

locationsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  validate(updateLocationSchema),
  locationsController.update,
)

locationsRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  locationsController.remove,
)
