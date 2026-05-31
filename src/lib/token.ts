import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { env } from './env'

// ── Refresh token design ─────────────────────────────────────────────────────
//
// A refresh token is a cryptographically random 48-byte value, base64url-encoded
// to a 64-character URL-safe string. It has ~384 bits of entropy.
//
// WHY SHA-256 for hashing (not bcrypt):
//   • bcrypt is designed for PASSWORD hashing — human-chosen strings with low
//     entropy that need thousands of iterations to resist offline brute-force.
//   • A 48-byte random token already has 2^384 entropy. There is no brute-force
//     attack possible. Using bcrypt would add 100–300 ms latency on every token
//     verification with zero security benefit.
//   • SHA-256 is the correct tool: fast, collision-resistant, and sufficient
//     when the input has high entropy.
//
// WHERE bcrypt IS used in this codebase:
//   • password hashing / verification helpers below (hashPassword, verifyPassword)
//     These are used for any custom password management outside Supabase Auth.
//
// ── Refresh token operations ──────────────────────────────────────────────────

export interface RefreshTokenPair {
  rawToken: string   // returned to the client — NEVER stored
  tokenHash: string  // SHA-256 hex — stored in DB
}

export function generateRefreshToken(): RefreshTokenPair {
  const rawToken = crypto.randomBytes(48).toString('base64url')
  const tokenHash = hashRefreshToken(rawToken)
  return { rawToken, tokenHash }
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export function getRefreshTokenExpiry(): Date {
  const date = new Date()
  date.setDate(date.getDate() + env.JWT_REFRESH_EXPIRES_DAYS)
  return date
}

// ── Password hashing (bcrypt) ─────────────────────────────────────────────────
// Cost factor 12 → ~300 ms on modern hardware. OWASP recommends ≥10.
// 12 is a practical production value: slow enough to resist brute-force,
// fast enough not to impact UX on login.
const BCRYPT_ROUNDS = 12

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}
