import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import { adminRoleParamSchema, updateRolePermissionSchema } from './admin-roles.schema'
import * as adminRolesController from './admin-roles.controller'

export const adminRolesRouter = Router()

// Only staff who can manage permissions may view or edit the matrix.
adminRolesRouter.use(authMiddleware, requireAdmin, requirePermission('employees.manage_permissions'))

adminRolesRouter.get('/permissions', adminRolesController.getMatrix)

adminRolesRouter.patch(
  '/:role/:permissionKey',
  validate(adminRoleParamSchema, 'params'),
  validate(updateRolePermissionSchema),
  adminRolesController.updatePermission,
)
