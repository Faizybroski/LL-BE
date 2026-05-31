import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  updateProfileSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  approveUserSchema,
} from './users.schema'
import * as usersController from './users.controller'

export const usersRouter = Router()

// ── Own profile ───────────────────────────────────────────────────────────────
usersRouter.get('/me', authMiddleware, usersController.getMe)
usersRouter.patch('/me', authMiddleware, validate(updateProfileSchema), usersController.updateMe)

// ── Admin: list and manage all users ─────────────────────────────────────────
usersRouter.get(
  '/',
  authMiddleware,
  requireRole('admin'),
  validate(listUsersQuerySchema, 'query'),
  usersController.listUsers,
)

usersRouter.patch(
  '/:id/role',
  authMiddleware,
  requireRole('admin'),
  validate(updateUserRoleSchema),
  usersController.updateUserRole,
)

usersRouter.patch(
  '/:id/approve',
  authMiddleware,
  requireRole('admin'),
  validate(approveUserSchema),
  usersController.approveUser,
)
