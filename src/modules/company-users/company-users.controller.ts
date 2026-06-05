import { Request, Response, NextFunction } from 'express'
import * as companyUsersService from './company-users.service'
import { ok, created, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateEmployeeDto, UpdateEmployeeDto, ListEmployeesQuery } from './company-users.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { employees, total } = await companyUsersService.listEmployees(
      req.user!.accountId!,
      req.query as unknown as ListEmployeesQuery,
    )
    paginated(res, employees, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = await companyUsersService.getEmployee(param(req, 'id'), req.user!.accountId!)
    ok(res, employee)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = await companyUsersService.createEmployee(
      req.body as CreateEmployeeDto,
      req.user!.accountId!,
    )
    created(res, employee, 'Employee created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = await companyUsersService.updateEmployee(
      param(req, 'id'),
      req.body as UpdateEmployeeDto,
      req.user!.accountId!,
    )
    ok(res, employee, 'Employee updated')
  } catch (err) {
    next(err)
  }
}
