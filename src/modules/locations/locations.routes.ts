import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission, requirePermissionIfAdmin } from '../../middleware/role.middleware'
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

// Shared with shippers (inline creation from the load/tracking form) — enforce
// the permission only for admin staff, leave shipper self-service untouched.
locationsRouter.post(
  '/',
  authMiddleware,
  requirePermissionIfAdmin('locations.create'),
  validate(createLocationSchema),
  locationsController.create,
)

locationsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('locations.edit'),
  validate(updateLocationSchema),
  locationsController.update,
)

locationsRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('locations.delete'),
  locationsController.remove,
)
