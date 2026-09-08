import { Request, Response, NextFunction } from 'express'
import * as usersService from './users.service'
import { AppError } from '../../lib/errors'
import { ok, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type { UpdateProfileDto, ListUsersQuery, UpdateUserRoleDto, ApproveUserDto } from './users.schema'

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await usersService.getProfile(req.user!.id)
    ok(res, profile)
  } catch (err) {
    next(err)
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await usersService.updateProfile(req.user!.id, req.body as UpdateProfileDto)
    ok(res, profile, 'Profile updated')
  } catch (err) {
    next(err)
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await usersService.getProfile(param(req, 'id'))
    ok(res, profile)
  } catch (err) {
    next(err)
  }
}

// Admin editing another user's basic profile (customers.edit) — reuses the same
// service path as PATCH /me.
export async function updateById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await usersService.updateProfile(param(req, 'id'), req.body as UpdateProfileDto)
    ok(res, profile, 'Profile updated')
  } catch (err) {
    next(err)
  }
}

// Admin removing a residential customer (customers.delete).
export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await usersService.deleteUser(param(req, 'id'))
    ok(res, null, 'Customer removed')
  } catch (err) {
    next(err)
  }
}

// A customer closing their own account. Corporate customers must delete the
// whole company account instead (DELETE /accounts/me).
export async function removeMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user!.role === 'corporate') {
      throw AppError.badRequest('Corporate customers must delete their company account instead')
    }
    await usersService.deleteUser(req.user!.id)
    ok(res, null, 'Account deleted')
  } catch (err) {
    next(err)
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { users, total } = await usersService.listUsers(req.query as unknown as ListUsersQuery)
    paginated(res, users, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await usersService.updateUserRole(param(req, 'id'), req.body as UpdateUserRoleDto, req.user!.id)
    ok(res, updated, 'Role updated')
  } catch (err) {
    next(err)
  }
}

export async function getAvatarUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await usersService.getAvatarUploadUrl(req.user!.id)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

export async function removeMyAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await usersService.removeAvatar(req.user!.id)
    ok(res, null, 'Avatar removed')
  } catch (err) {
    next(err)
  }
}

export async function approveUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await usersService.approveUser(param(req, 'id'), req.body as ApproveUserDto, req.user!.id)
    ok(res, updated, 'Approval status updated')
  } catch (err) {
    next(err)
  }
}
