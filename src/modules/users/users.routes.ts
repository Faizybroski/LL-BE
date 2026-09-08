import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole, requirePermission } from '../../middleware/role.middleware'
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
// Self-service account closure (residential customers). Declared before '/:id'
// so "me" is not captured as an id param.
usersRouter.delete('/me', authMiddleware, usersController.removeMe)

// ── Avatar upload (signed-URL flow — bypasses storage RLS) ───────────────────
usersRouter.post('/me/avatar/upload-url', authMiddleware, usersController.getAvatarUploadUrl)
usersRouter.delete('/me/avatar', authMiddleware, usersController.removeMyAvatar)

// ── Admin: list and manage all users ─────────────────────────────────────────
// This generic endpoint is what the residential-customer pages (and the
// create-delivery residential customer picker) actually list from — gate it on
// the same customers.view permission those pages already assume, rather
// than inventing a separate key.
usersRouter.get(
  '/',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.view'),
  validate(listUsersQuerySchema, 'query'),
  usersController.listUsers,
)

usersRouter.get(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.view'),
  usersController.getById,
)

// Admin edit / delete of a residential customer's profile.
usersRouter.patch(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.edit'),
  validate(updateProfileSchema),
  usersController.updateById,
)

usersRouter.delete(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.delete'),
  usersController.remove,
)

usersRouter.patch(
  '/:id/role',
  authMiddleware,
  requireRole('admin'),
  requirePermission('employees.manage_roles'),
  validate(updateUserRoleSchema),
  usersController.updateUserRole,
)

// The corporate-customer approve/reject flow already gates this button on
// customers.edit in the frontend — enforce the same key here.
usersRouter.patch(
  '/:id/approve',
  authMiddleware,
  requireRole('admin'),
  requirePermission('customers.edit'),
  validate(approveUserSchema),
  usersController.approveUser,
)
