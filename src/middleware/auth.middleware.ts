import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt'
import { AppError } from '../lib/errors'

// ── Role types ────────────────────────────────────────────────────────────────
// Defined here so every module that imports AuthenticatedRequest gets it
// from one canonical location.
export type UserRole    = 'admin' | 'shipper'
export type CompanyRole = 'company_admin' | 'employee' | null

// ── Auth middleware ───────────────────────────────────────────────────────────
// Previous implementation: supabase.auth.getUser(token) — 1 network call per request.
// This implementation: jwt.verify(token, secret) — pure cryptography, <1 ms, no I/O.
//
// The role is embedded in the JWT payload at login time, so RBAC decisions
// require zero DB lookups during the lifetime of the access token.
// If a user's role changes, it takes effect on their next login (15 min max).
// For immediate revocation use cases, add a token blocklist (Redis).
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return void next(AppError.unauthorized('Authorization header missing or malformed'))
  }

  const token = authHeader.split(' ')[1]

  // verifyAccessToken throws AppError — caught by the global error handler
  const payload = verifyAccessToken(token!)
  req.user = {
    id:          payload.sub,
    email:       payload.email,
    role:        payload.role,
    accountId:   payload.accountId ?? null,
    companyRole: payload.companyRole ?? null,
  }

  next()
}
