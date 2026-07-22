import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createAdminEmployeeSchema,
  updateAdminEmployeeSchema,
  listAdminEmployeesSchema,
} from './admin-employees.schema'
import * as adminEmployeesController from './admin-employees.controller'

export const adminEmployeesRouter = Router()

// All routes require an authenticated platform admin.
adminEmployeesRouter.use(authMiddleware, requireAdmin)

adminEmployeesRouter.get(
  '/',
  requirePermission('employees.view'),
  validate(listAdminEmployeesSchema, 'query'),
  adminEmployeesController.list,
)

adminEmployeesRouter.post(
  '/',
  requirePermission('employees.create'),
  validate(createAdminEmployeeSchema),
  adminEmployeesController.create,
)

adminEmployeesRouter.get(
  '/:id',
  requirePermission('employees.view'),
  adminEmployeesController.getOne,
)

// No single requirePermission gate here — updateAdminEmployee() checks per-field
// (employees.edit / employees.manage_roles / employees.suspend) based on what the
// request body actually changes, since those are separate granular permissions.
adminEmployeesRouter.patch(
  '/:id',
  validate(updateAdminEmployeeSchema),
  adminEmployeesController.update,
)
