import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireAdmin, requireCompanyAdmin, requirePermission } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsQuerySchema,
  createAccountNoteSchema,
  updateAccountNoteSchema,
  updateOwnProfileSchema,
  updateCompanyLogoSchema,
  updateOwnCompanySchema,
} from './accounts.schema'
import * as accountsController from './accounts.controller'

export const accountsRouter = Router()

// ── Shipper: own profile ──────────────────────────────────────────────────────
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
