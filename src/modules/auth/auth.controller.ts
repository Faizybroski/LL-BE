import { Request, Response, NextFunction } from 'express'
import * as authService from './auth.service'
import { ok, created } from '../../lib/response'
import type { LoginDto, RefreshDto, LogoutDto, RegisterDto, ChangePasswordDto } from './auth.schema'

// ── Context helper ────────────────────────────────────────────────────────────
// Extracts IP + User-Agent for session metadata.
// IP resolution: respect X-Forwarded-For only if you trust your proxy/load
// balancer. In production, set trust proxy in Express: app.set('trust proxy', 1)
function requestContext(req: Request) {
  return {
    ipAddress: (req.ip ?? req.socket.remoteAddress) as string | undefined,
    userAgent: req.get('User-Agent'),
  }
}

// ── POST /api/v1/auth/login ────────────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body as LoginDto, requestContext(req))
    ok(res, result, 'Login successful')
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/register ────────────────────────────────────────────────
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body as RegisterDto, requestContext(req))
    created(res, result, 'Account created successfully')
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/refresh ──────────────────────────────────────────────────
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refresh(req.body as RefreshDto, requestContext(req))
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/logout ───────────────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // authMiddleware guarantees req.user is populated on this route
    const result = await authService.logout(req.user!.id, req.body as LogoutDto)
    ok(res, null, result.message)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/v1/auth/me ────────────────────────────────────────────────────────
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await authService.getMe(req.user!.id)
    ok(res, profile)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/change-password ─────────────────────────────────────────
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.changePassword(
      req.user!.id,
      req.body as ChangePasswordDto,
    )
    ok(res, null, result.message)
  } catch (err) {
    next(err)
  }
}
