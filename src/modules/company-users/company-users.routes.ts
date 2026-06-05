import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireCompanyAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesSchema,
} from './company-users.schema'
import * as companyUsersController from './company-users.controller'

export const companyUsersRouter = Router()

// All routes require a company admin session
companyUsersRouter.use(authMiddleware, requireCompanyAdmin)

companyUsersRouter.get(
  '/',
  validate(listEmployeesSchema, 'query'),
  companyUsersController.list,
)

companyUsersRouter.post(
  '/',
  validate(createEmployeeSchema),
  companyUsersController.create,
)

companyUsersRouter.get('/:id', companyUsersController.getOne)

companyUsersRouter.patch(
  '/:id',
  validate(updateEmployeeSchema),
  companyUsersController.update,
)
