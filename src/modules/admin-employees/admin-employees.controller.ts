import { Request, Response, NextFunction } from 'express'
import * as adminEmployeesService from './admin-employees.service'
import { ok, created, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateAdminEmployeeDto, UpdateAdminEmployeeDto, ListAdminEmployeesQuery } from './admin-employees.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { employees, total } = await adminEmployeesService.listAdminEmployees(
      req.query as unknown as ListAdminEmployeesQuery,
    )
    paginated(res, employees, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = await adminEmployeesService.getAdminEmployee(param(req, 'id'))
    ok(res, employee)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = await adminEmployeesService.createAdminEmployee(
      { id: req.user!.id, permissions: req.user!.permissions },
      req.body as CreateAdminEmployeeDto,
    )
    created(res, employee, 'Employee created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = await adminEmployeesService.updateAdminEmployee(
      { id: req.user!.id, permissions: req.user!.permissions },
      param(req, 'id'),
      req.body as UpdateAdminEmployeeDto,
    )
    ok(res, employee, 'Employee updated')
  } catch (err) {
    next(err)
  }
}
