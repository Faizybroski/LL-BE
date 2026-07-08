import { Router } from 'express'
import { authLimiter } from '../../middleware/rate-limit.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validate } from '../../lib/validate'
import {
  loginSchema,
  registerSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  mfaCodeSchema,
  mfaDisableSchema,
  mfaChallengeSchema,
} from './auth.schema'
import * as authController from './auth.controller'

export const authRouter = Router()

// ── Public endpoints ───────────────────────────────────────────────────────────
// authLimiter: 20 requests / 15 min — prevents brute-force and credential stuffing.
authRouter.post('/login',    authLimiter, validate(loginSchema),    authController.login)
authRouter.post('/register', authLimiter, validate(registerSchema), authController.register)

// Refresh & logout use the standard limiter (defaultLimiter is applied globally).
// A separate tighter limiter can be added here if token farming becomes a concern.
authRouter.post('/refresh', validate(refreshSchema), authController.refresh)

// Second step of login when MFA is enabled — rate-limited like login itself.
authRouter.post(
  '/mfa/challenge',
  authLimiter,
  validate(mfaChallengeSchema),
  authController.mfaChallenge,
)

// ── Protected endpoints (require valid access token) ──────────────────────────
authRouter.get('/me', authMiddleware, authController.me)

// Logout accepts an optional refresh token to revoke; auth required to bind to a user.
authRouter.post('/logout', authMiddleware, validate(logoutSchema), authController.logout)

// Password change requires a valid session AND the current password (re-auth)
authRouter.post(
  '/change-password',
  authMiddleware,
  validate(changePasswordSchema),
  authController.changePassword,
)

// ── MFA (Security settings) ────────────────────────────────────────────────────
authRouter.get('/mfa/status', authMiddleware, authController.mfaStatus)
authRouter.post('/mfa/enroll', authMiddleware, authController.mfaEnroll)
authRouter.post('/mfa/verify', authMiddleware, validate(mfaCodeSchema), authController.mfaVerify)
authRouter.post('/mfa/disable', authMiddleware, validate(mfaDisableSchema), authController.mfaDisable)

// ── Sessions ────────────────────────────────────────────────────────────────────
authRouter.get('/sessions', authMiddleware, authController.listSessions)
authRouter.delete('/sessions/:tokenId', authMiddleware, authController.revokeSession)
