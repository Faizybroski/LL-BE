import jwt, { SignOptions } from 'jsonwebtoken'
import { env } from './env'
import { AppError } from './errors'
import type { UserRole, CompanyRole, AdminRole } from '../middleware/auth.middleware'

// ── Payload contract ────────────────────────────────────────────────────────
// Minimal claims — role is included so middleware can authorise without a DB call.
// Never include sensitive data (passwords, PII beyond email/role) in a JWT.
export interface JwtPayload {
  sub:         string          // user ID (Supabase auth.users.id)
  email:       string
  role:        UserRole
  accountId:   string | null   // shipper's account; null for admin users
  companyRole: CompanyRole      // company_admin | employee | null (null for admins)
  adminRole?:  AdminRole        // ceo | vp | manager | assistant | null (null for shippers)
  permissions?: string[]        // resolved granted permission keys for adminRole, snapshotted at issue time
  iat:         number          // issued-at  (added automatically by jsonwebtoken)
  exp:         number          // expiry     (added automatically by jsonwebtoken)
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

// ── MFA challenge token ────────────────────────────────────────────────────────
// Issued after password verification when the account has MFA enabled. Short-lived
// (5 min) and distinct from the access token (typ claim) so it can never be used
// to authenticate API requests — only to complete the MFA challenge step.
export interface MfaChallengePayload {
  sub: string
  typ: 'mfa_challenge'
  iat: number
  exp: number
}

export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'mfa_challenge' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  })
}

export function verifyMfaChallengeToken(token: string): MfaChallengePayload {
  let payload: MfaChallengePayload
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as MfaChallengePayload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('MFA challenge has expired — please log in again')
    }
    throw AppError.unauthorized('Invalid MFA challenge token')
  }
  if (payload.typ !== 'mfa_challenge') {
    throw AppError.unauthorized('Invalid MFA challenge token')
  }
  return payload
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
