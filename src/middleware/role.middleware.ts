import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'
import type { UserRole } from './auth.middleware'


// ── requireRole ───────────────────────────────────────────────────────────────
// Usage:  router.get('/admin-only', authMiddleware, requireRole('admin'), handler)
//         router.get('/either',     authMiddleware, requireRole('admin', 'shipper'), handler)
//
// This runs AFTER authMiddleware, so req.user is guaranteed to be populated.
// The role comes from the JWT payload — no DB call needed.
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Should never happen if authMiddleware runs first — defensive guard
      return void next(AppError.unauthorized())
    }

    if (!allowedRoles.includes(req.user.role)) {
      return void next(
        AppError.forbidden(
          `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        ),
      )
    }

    next()
  }
}

// ── requireAdmin ──────────────────────────────────────────────────────────────
// Shorthand for requireRole('admin') — cleaner at the call site.
export const requireAdmin = requireRole('admin')

// ── requireCompanyAdmin ───────────────────────────────────────────────────────
// Requires the user to be a shipper with company_role = 'company_admin'.
// Used for routes that only company admins (not employees) may call.
export function requireCompanyAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return void next(AppError.unauthorized())
  }
  if (req.user.role !== 'shipper' || req.user.companyRole !== 'company_admin') {
    return void next(AppError.forbidden('This action requires Company Admin role'))
  }
  next()
}

// ── requirePermission ─────────────────────────────────────────────────────────
// Requires the user to be a platform admin whose JWT-embedded permission
// snapshot includes the given key. Permissions are resolved from
// admin_role_permissions at login/refresh time — the same "no DB call, up to
// 15 min staleness on change" tradeoff as role/companyRole (see auth.middleware.ts).
// Usage: router.delete('/:id', authMiddleware, requirePermission('invoices.delete'), handler)
export function requirePermission(key: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return void next(AppError.unauthorized())
    }
    if (req.user.role !== 'admin' || !req.user.permissions.includes(key)) {
      return void next(AppError.forbidden(`This action requires the "${key}" permission`))
    }
    next()
  }
}

// ── requirePermissionIfAdmin ──────────────────────────────────────────────────
// Like requirePermission, but only enforced for platform admins — shippers pass
// through untouched. For routes shared between both roles (e.g. GET /quotations,
// which shippers use to view their own quotations and admins use to view all of
// them), requirePermission would incorrectly block every shipper too.
// Usage: router.get('/', authMiddleware, requirePermissionIfAdmin('quotations.view'), handler)
export function requirePermissionIfAdmin(key: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return void next(AppError.unauthorized())
    }
    if (req.user.role === 'admin' && !req.user.permissions.includes(key)) {
      return void next(AppError.forbidden(`This action requires the "${key}" permission`))
    }
    next()
  }
}

// ── requireOwnerOrAdmin ───────────────────────────────────────────────────────
// Allows the resource owner OR any admin to proceed.
// Used for routes like PATCH /users/:id — a user can edit their own profile
// and an admin can edit any profile.
//
// Usage:
//   router.patch('/:id', authMiddleware, requireOwnerOrAdmin(req => req.params['id']), handler)
export function requireOwnerOrAdmin(getResourceUserId: (req: Request) => string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return void next(AppError.unauthorized())
    }

    const resourceUserId = getResourceUserId(req)
    const isOwner = req.user.id === resourceUserId
    const isAdmin = req.user.role === 'admin'

    if (!isOwner && !isAdmin) {
      return void next(AppError.forbidden('You do not have access to this resource'))
    }

    next()
  }
}
