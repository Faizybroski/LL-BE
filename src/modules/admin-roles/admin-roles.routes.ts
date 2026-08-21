import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  adminRoleParamSchema,
  updateRolePermissionSchema,
  createAdminRoleSchema,
  updateAdminRoleSchema,
  adminRoleSlugParamSchema,
} from './admin-roles.schema'
import * as adminRolesController from './admin-roles.controller'

export const adminRolesRouter = Router()

// Only staff who can manage permissions may view or edit the matrix.
adminRolesRouter.use(authMiddleware, requireAdmin, requirePermission('employees.manage_permissions'))

adminRolesRouter.get('/permissions', adminRolesController.getMatrix)

// ── Role CRUD ──────────────────────────────────────────────────────────────────
// Registered before the generic "/:role/:permissionKey" route below so
// "/roles/..." isn't swallowed by that wildcard (role="roles", permissionKey=slug).
adminRolesRouter.get('/roles', adminRolesController.listRoles)

adminRolesRouter.post(
  '/roles',
  validate(createAdminRoleSchema),
  adminRolesController.createRole,
)

adminRolesRouter.patch(
  '/roles/:role',
  validate(adminRoleSlugParamSchema, 'params'),
  validate(updateAdminRoleSchema),
  adminRolesController.renameRole,
)

adminRolesRouter.delete(
  '/roles/:role',
  validate(adminRoleSlugParamSchema, 'params'),
  adminRolesController.deleteRole,
)

adminRolesRouter.patch(
  '/:role/:permissionKey',
  validate(adminRoleParamSchema, 'params'),
  validate(updateRolePermissionSchema),
  adminRolesController.updatePermission,
)
