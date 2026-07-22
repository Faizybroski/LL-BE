import { Request, Response, NextFunction } from 'express'
import * as adminRolesService from './admin-roles.service'
import { ok } from '../../lib/response'
import { param } from '../../lib/params'
import type { UpdateRolePermissionDto, AdminRoleValue } from './admin-roles.schema'

export async function getMatrix(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const matrix = await adminRolesService.getPermissionsMatrix()
    ok(res, matrix)
  } catch (err) {
    next(err)
  }
}

export async function updatePermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = param(req, 'role') as AdminRoleValue
    const permissionKey = param(req, 'permissionKey')
    const { granted } = req.body as UpdateRolePermissionDto
    const grant = await adminRolesService.updateRolePermission(role, permissionKey, granted)
    ok(res, grant, 'Permission updated')
  } catch (err) {
    next(err)
  }
}
