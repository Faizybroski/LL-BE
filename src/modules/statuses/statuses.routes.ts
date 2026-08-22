import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission, requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createStatusSchema,
  updateStatusSchema,
  listStatusesSchema,
} from './statuses.schema'
import * as statusesController from './statuses.controller'

export const statusesRouter = Router()

// All authenticated users: read
statusesRouter.get('/',        authMiddleware, validate(listStatusesSchema, 'query'), statusesController.list)
statusesRouter.get('/all',     authMiddleware, statusesController.listAll)
statusesRouter.get('/search',  authMiddleware, statusesController.search)
statusesRouter.get('/:id',     authMiddleware, statusesController.getOne)

// Any authenticated user can create a custom status (inline from dropdown) —
// enforce the permission only for admin staff, corporates stay unaffected.
statusesRouter.post('/', authMiddleware, requirePermissionIfAdmin('statuses.create'), validate(createStatusSchema), statusesController.create)

// Admin-only: edit / soft-delete custom statuses
statusesRouter.patch( '/:id', authMiddleware, requireAdmin, requirePermission('statuses.edit'), validate(updateStatusSchema), statusesController.update)
statusesRouter.delete('/:id', authMiddleware, requireAdmin, requirePermission('statuses.delete'), statusesController.remove)
