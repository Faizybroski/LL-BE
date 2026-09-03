import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requireCompanyAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createAccountSchema,
  updateAccountSchema,
  rejectAccountSchema,
  listAccountsQuerySchema,
  createAccountNoteSchema,
  updateAccountNoteSchema,
  updateOwnProfileSchema,
  updateCompanyLogoSchema,
  updateOwnCompanySchema,
} from './accounts.schema'
import * as accountsController from './accounts.controller'

export const accountsRouter = Router()

// ── Corporate: own profile ──────────────────────────────────────────────────────
// Mounted before /:id so the literal "me" path is not captured as an ID param.
accountsRouter.get(
  '/me',
  authMiddleware,
  accountsController.getMyProfile,
)

accountsRouter.patch(
  '/me',
  authMiddleware,
  validate(updateOwnProfileSchema),
  accountsController.updateMyProfile,
)

accountsRouter.patch(
  '/me/logo',
  authMiddleware,
  requireCompanyAdmin,
  validate(updateCompanyLogoSchema),
  accountsController.updateMyCompanyLogo,
)

// Company info/contacts self-service — company_admin only, scoped to their own account
accountsRouter.patch(
  '/me/company',
  authMiddleware,
  requireCompanyAdmin,
  validate(updateOwnCompanySchema),
  accountsController.updateMyCompany,
)

// Own company dashboard data (identity page parity with the admin view)
accountsRouter.get('/me/stats',    authMiddleware, accountsController.myStats)
accountsRouter.get('/me/activity', authMiddleware, accountsController.myActivity)

// ── Logo upload (signed-URL flow — bypasses storage RLS) ─────────────────────
accountsRouter.post(
  '/me/logo/upload-url',
  authMiddleware,
  requireCompanyAdmin,
  accountsController.myLogoUploadUrl,
)

accountsRouter.delete(
  '/me/logo',
  authMiddleware,
  requireCompanyAdmin,
  accountsController.removeMyLogo,
)

// ── Admin: Account CRUD ───────────────────────────────────────────────────────
accountsRouter.get(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.view'),
  validate(listAccountsQuerySchema, 'query'),
  accountsController.list,
)

accountsRouter.post(
  '/',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.create'),
  validate(createAccountSchema),
  accountsController.create,
)

accountsRouter.get(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.view'),
  accountsController.getOne,
)

accountsRouter.patch(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.edit'),
  validate(updateAccountSchema),
  accountsController.update,
)

accountsRouter.patch(
  '/:id/logo',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.edit'),
  validate(updateCompanyLogoSchema),
  accountsController.updateOneCompanyLogo,
)

accountsRouter.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.delete'),
  accountsController.remove,
)

// ── Admin: review lifecycle (reject / reconsider / purge) ────────────────────
accountsRouter.post(
  '/:id/reject',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.delete'),
  validate(rejectAccountSchema),
  accountsController.reject,
)

accountsRouter.post(
  '/:id/reconsider',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.edit'),
  accountsController.reconsider,
)

accountsRouter.post(
  '/:id/purge',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.delete'),
  accountsController.purge,
)

accountsRouter.get(
  '/:id/stats',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.view'),
  accountsController.stats,
)

accountsRouter.get(
  '/:id/activity',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.view'),
  accountsController.activity,
)

// ── Admin: Account Notes ──────────────────────────────────────────────────────
accountsRouter.get(
  '/:id/notes',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.view'),
  accountsController.listNotes,
)

accountsRouter.post(
  '/:id/notes',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.edit'),
  validate(createAccountNoteSchema),
  accountsController.createNote,
)

accountsRouter.patch(
  '/:id/notes/:noteId',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.edit'),
  validate(updateAccountNoteSchema),
  accountsController.updateNote,
)

accountsRouter.delete(
  '/:id/notes/:noteId',
  authMiddleware,
  requireAdmin,
  requirePermission('customers.edit'),
  accountsController.deleteNote,
)
