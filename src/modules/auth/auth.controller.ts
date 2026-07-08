import { Request, Response, NextFunction } from 'express'
import * as authService from './auth.service'
import { ok, created } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  LoginDto,
  RefreshDto,
  LogoutDto,
  RegisterDto,
  ChangePasswordDto,
  MfaCodeDto,
  MfaDisableDto,
  MfaChallengeDto,
} from './auth.schema'

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

// ── POST /api/v1/auth/mfa/challenge ────────────────────────────────────────────
export async function mfaChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.mfaChallenge(req.body as MfaChallengeDto, requestContext(req))
    ok(res, result, 'Login successful')
  } catch (err) {
    next(err)
  }
}

// ── GET /api/v1/auth/mfa/status ────────────────────────────────────────────────
export async function mfaStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.getMfaStatus(req.user!.id)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/mfa/enroll ───────────────────────────────────────────────
export async function mfaEnroll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.enrollMfa(req.user!.id)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/mfa/verify ───────────────────────────────────────────────
export async function mfaVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.verifyMfaEnrollment(req.user!.id, req.body as MfaCodeDto)
    ok(res, null, result.message)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/v1/auth/mfa/disable ──────────────────────────────────────────────
export async function mfaDisable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.disableMfaForUser(req.user!.id, req.body as MfaDisableDto)
    ok(res, null, result.message)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/v1/auth/sessions ───────────────────────────────────────────────────
// The current session's refresh token is passed via a header (not query string)
// so it never ends up in server/proxy access logs — used only to flag "this device".
export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const currentRefreshToken = req.get('X-Refresh-Token') || undefined
    const result = await authService.listSessions(req.user!.id, currentRefreshToken)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

// ── DELETE /api/v1/auth/sessions/:tokenId ──────────────────────────────────────
export async function revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.revokeSession(req.user!.id, param(req, 'tokenId'))
    ok(res, null, 'Session revoked')
  } catch (err) {
    next(err)
  }
}
