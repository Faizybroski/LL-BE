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
