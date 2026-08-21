import { Request, Response, NextFunction } from 'express'
import * as adminRolesService from './admin-roles.service'
import { ok, created } from '../../lib/response'
import { param } from '../../lib/params'
import type { UpdateRolePermissionDto, AdminRoleValue, CreateAdminRoleDto, UpdateAdminRoleDto } from './admin-roles.schema'

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

export async function listRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await adminRolesService.listRoles()
    ok(res, roles)
  } catch (err) {
    next(err)
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug, label } = req.body as CreateAdminRoleDto
    const role = await adminRolesService.createRole(slug, label)
    created(res, role, 'Role created')
  } catch (err) {
    next(err)
  }
}

export async function renameRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = param(req, 'role')
    const { label } = req.body as UpdateAdminRoleDto
    const updated = await adminRolesService.renameRole(role, label)
    ok(res, updated, 'Role renamed')
  } catch (err) {
    next(err)
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = param(req, 'role')
    await adminRolesService.deleteRoleBySlug(role)
    ok(res, null, 'Role deleted')
  } catch (err) {
    next(err)
  }
}
