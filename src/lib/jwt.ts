import jwt, { SignOptions } from 'jsonwebtoken'
import { env } from './env'
import { AppError } from './errors'
import type { UserRole } from '../middleware/auth.middleware'

// ── Payload contract ────────────────────────────────────────────────────────
// Minimal claims — role is included so middleware can authorise without a DB call.
// Never include sensitive data (passwords, PII beyond email/role) in a JWT.
export interface JwtPayload {
  sub:       string          // user ID (Supabase auth.users.id)
  email:     string
  role:      UserRole
  accountId: string | null   // shipper's account; null for admin users
  iat:       number          // issued-at  (added automatically by jsonwebtoken)
  exp:       number          // expiry     (added automatically by jsonwebtoken)
}

// ── Sign ─────────────────────────────────────────────────────────────────────
export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  // Cast expiresIn as SignOptions['expiresIn'] — the value comes from env which
  // is already validated to be a legal duration string (e.g. "15m", "1h").
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  }
  return jwt.sign(payload, env.JWT_SECRET, options)
}

// ── Verify ───────────────────────────────────────────────────────────────────
// Pure cryptographic verification — no network call, executes in <1 ms.
// Previous approach called supabase.auth.getUser() (network) on every request.
export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token has expired')
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw AppError.unauthorized('Invalid access token')
    }
    throw AppError.unauthorized('Token verification failed')
  }
}

// ── Decode without verification ───────────────────────────────────────────────
// ONLY for extracting user ID from an expired token during refresh flows.
// NEVER use the payload for authorization decisions.
export function decodeTokenUnsafe(token: string): Partial<JwtPayload> | null {
  try {
    return jwt.decode(token) as Partial<JwtPayload>
  } catch {
    return null
  }
}
