import { Request, Response, NextFunction } from 'express'
import * as usersService from './users.service'
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
    const updated = await usersService.updateUserRole(param(req, 'id'), req.body as UpdateUserRoleDto)
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
    const updated = await usersService.approveUser(param(req, 'id'), req.body as ApproveUserDto)
    ok(res, updated, 'Approval status updated')
  } catch (err) {
    next(err)
  }
}
