import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import { env } from '../../lib/env'
import { signAccessToken, signMfaChallengeToken, verifyMfaChallengeToken } from '../../lib/jwt'
import {
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} from '../../lib/token'
import { generateTotpSecret, buildProvisioningQrCode, verifyTotpCode } from '../../lib/totp'
import * as authRepo from './auth.repository'
import { logger } from '../../lib/logger'
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
import type { UserRole, CompanyRole } from '../../middleware/auth.middleware'

// Converts JWT duration strings ("15m", "1h", "30s") to seconds for the API response.
function parseExpiry(s: string): number {
  const m = s.match(/^(\d+)(s|m|h|d)$/)
  if (!m) return 900
  const n = parseInt(m[1], 10)
  switch (m[2]) {
    case 's': return n
    case 'm': return n * 60
    case 'h': return n * 3600
    case 'd': return n * 86400
    default:  return 900
  }
}

// ── Shared token-pair builder ─────────────────────────────────────────────────
// Extracted so login + refresh produce identically-shaped responses.
async function issueTokenPair(
  userId:      string,
  email:       string,
  role:        UserRole,
  accountId:   string | null,
  companyRole: CompanyRole,
  context:     { ipAddress?: string; userAgent?: string },
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  // 1. Sign a short-lived JWT (15 min by default)
  const accessToken = signAccessToken({ sub: userId, email, role, accountId, companyRole })

  // 2. Generate an opaque refresh token and store its SHA-256 hash
  const { rawToken, tokenHash } = generateRefreshToken()
  const expiresAt = getRefreshTokenExpiry()

  const { error } = await authRepo.insertRefreshToken({
    userId,
    tokenHash,
    expiresAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  })

  if (error) {
    logger.error('Failed to persist refresh token', { userId, error: error.message })
    throw AppError.internal('Failed to establish session')
  }

  return {
    accessToken,
    refreshToken: rawToken, // raw value — only time it ever leaves the server
    expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRES_IN),
  }
}

// ── POST /auth/login ──────────────────────────────────────────────────────────
export async function login(
  dto: LoginDto,
  context: { ipAddress?: string; userAgent?: string },
) {
  // Supabase Auth handles the bcrypt password verification internally.
  // This is equivalent to calling bcrypt.compare() ourselves — Supabase GoTrue
  // stores passwords as bcrypt hashes. We delegate credential verification
  // rather than duplicating it.
  const { data, error } = await supabase.auth.signInWithPassword({
    email: dto.email,
    password: dto.password,
  })

  // Deliberately vague error message — never disclose whether email or
  // password was wrong to prevent user enumeration attacks.
  if (error || !data.user) {
    throw AppError.unauthorized('Invalid email or password')
  }

  // Fetch role + account status from our own profiles table.
  // The role lives here because auth.users is managed by Supabase
  // and should not be extended with application-level attributes.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, company_role, full_name, avatar_url, is_active, account_id, mfa_enabled')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    logger.error('Profile missing for authenticated user', { userId: data.user.id })
    throw AppError.internal('User profile not found')
  }

  if (!profile.is_active) {
    throw AppError.forbidden('Account has been deactivated')
  }

  // MFA is enabled — withhold tokens until the second factor is verified.
  if (profile.mfa_enabled) {
    return {
      mfaRequired: true as const,
      challengeToken: signMfaChallengeToken(data.user.id),
    }
  }

  const companyRole = (profile.company_role ?? null) as CompanyRole
  const tokens = await issueTokenPair(data.user.id, data.user.email!, profile.role as UserRole, profile.account_id, companyRole, context)

  return {
    mfaRequired: false as const,
    ...tokens,
    user: {
      id:          data.user.id,
      email:       data.user.email,
      role:        profile.role,
      companyRole: profile.company_role ?? null,
      fullName:    profile.full_name,
      avatarUrl:   profile.avatar_url ?? null,
      accountId:   profile.account_id,
    },
  }
}

// ── POST /auth/mfa/challenge ────────────────────────────────────────────────────
// Second step of login: exchanges a valid challengeToken + TOTP code for a full token pair.
export async function mfaChallenge(
  dto: MfaChallengeDto,
  context: { ipAddress?: string; userAgent?: string },
) {
  const { sub: userId } = verifyMfaChallengeToken(dto.challengeToken)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, company_role, is_active, account_id, mfa_secret, mfa_enabled')
    .eq('id', userId)
    .single()

  if (profileError || !profile) throw AppError.unauthorized('User not found')
  if (!profile.is_active) throw AppError.forbidden('Account has been deactivated')
  if (!profile.mfa_enabled || !profile.mfa_secret) {
    throw AppError.badRequest('MFA is not enabled for this account')
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const email = authUser.user?.email ?? ''

  if (!verifyTotpCode(email, profile.mfa_secret, dto.code)) {
    throw AppError.unauthorized('Invalid verification code')
  }

  const companyRole = (profile.company_role ?? null) as CompanyRole
  const tokens = await issueTokenPair(userId, email, profile.role as UserRole, profile.account_id, companyRole, context)

  return {
    ...tokens,
    user: {
      id:          userId,
      email,
      role:        profile.role,
      companyRole: profile.company_role ?? null,
      fullName:    authUser.user?.user_metadata?.full_name ?? null,
      avatarUrl:   null,
      accountId:   profile.account_id,
    },
  }
}

// ── MFA enrollment (Security settings) ────────────────────────────────────────
export async function enrollMfa(userId: string) {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  if (!authUser.user?.email) throw AppError.notFound('User')

  const secret = generateTotpSecret()
  const { error } = await authRepo.setPendingMfaSecret(userId, secret)
  if (error) throw AppError.internal('Failed to start MFA enrollment')

  const { otpauthUrl, qrCodeDataUrl } = await buildProvisioningQrCode(authUser.user.email, secret)
  return { secret, otpauthUrl, qrCodeDataUrl }
}

export async function verifyMfaEnrollment(userId: string, dto: MfaCodeDto) {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  if (!authUser.user?.email) throw AppError.notFound('User')

  const { data: profile, error } = await authRepo.findMfaByUserId(userId)
  if (error || !profile?.mfa_secret) throw AppError.badRequest('MFA enrollment has not been started')

  if (!verifyTotpCode(authUser.user.email, profile.mfa_secret, dto.code)) {
    throw AppError.unauthorized('Invalid verification code')
  }

  const { error: enableError } = await authRepo.enableMfa(userId)
  if (enableError) throw AppError.internal('Failed to enable MFA')

  return { message: 'MFA enabled' }
}

export async function disableMfaForUser(userId: string, dto: MfaDisableDto) {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  if (!authUser.user?.email) throw AppError.notFound('User')

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password: dto.password,
  })
  if (verifyError) throw AppError.unauthorized('Password is incorrect')

  const { data: profile, error } = await authRepo.findMfaByUserId(userId)
  if (error || !profile?.mfa_enabled || !profile.mfa_secret) {
    throw AppError.badRequest('MFA is not enabled for this account')
  }

  if (!verifyTotpCode(authUser.user.email, profile.mfa_secret, dto.code)) {
    throw AppError.unauthorized('Invalid verification code')
  }

  const { error: disableError } = await authRepo.disableMfa(userId)
  if (disableError) throw AppError.internal('Failed to disable MFA')

  return { message: 'MFA disabled' }
}

export async function getMfaStatus(userId: string) {
  const { data, error } = await authRepo.findMfaByUserId(userId)
  if (error || !data) throw AppError.notFound('User')
  return { enabled: data.mfa_enabled, enrolledAt: data.mfa_enrolled_at }
}

// ── Sessions ───────────────────────────────────────────────────────────────────
export async function listSessions(userId: string, currentRefreshToken?: string) {
  const { data, error } = await authRepo.findActiveSessionsByUser(userId)
  if (error) throw AppError.internal('Failed to fetch sessions')

  const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null

  return (data ?? []).map((session) => ({
    tokenId:    session.token_id,
    deviceInfo: session.device_info,
    ipAddress:  session.ip_address,
    userAgent:  session.user_agent,
    createdAt:  session.created_at,
    lastUsedAt: session.last_used_at,
    expiresAt:  session.expires_at,
    isCurrent:  currentHash !== null && session.token_hash === currentHash,
  }))
}

export async function revokeSession(userId: string, tokenId: string) {
  const { data: session, error } = await authRepo.findSessionById(tokenId)
  if (error || !session || session.user_id !== userId) {
    throw AppError.notFound('Session')
  }
  if (!session.is_revoked) {
    await authRepo.revokeRefreshToken(tokenId)
  }
}

// ── POST /auth/refresh ─────────────────────────────────────────────────────────
// Implements RFC 9068 / OAuth 2.0 refresh token rotation with reuse detection.
//
// Token rotation: every successful refresh invalidates the old token and issues
// a new one. This limits the damage window if a token is stolen.
//
// Reuse detection: if a previously-revoked token is presented, an attacker has
// either stolen the token OR the legitimate client is replaying it. Either way,
// the safest response is to revoke ALL tokens for this user immediately.
export async function refresh(
  dto: RefreshDto,
  context: { ipAddress?: string; userAgent?: string },
) {
  const tokenHash = hashRefreshToken(dto.refreshToken)

  // First check: does this hash match ANY token (revoked or not)?
  const { data: anyToken } = await authRepo.findRefreshTokenByHash(tokenHash)

  if (!anyToken) {
    // Token is completely unknown — forged or from a different environment
    throw AppError.unauthorized('Invalid refresh token')
  }

  if (anyToken.is_revoked) {
    // ── REUSE DETECTED ────────────────────────────────────────────────────────
    // A revoked token is being replayed. This indicates either:
    //   a) The legitimate client replayed an already-rotated token (bug/race)
    //   b) An attacker stole the old token after rotation
    //
    // In either case: revoke ALL sessions for this user immediately.
    // Log it as a security event for investigation.
    logger.warn('Refresh token reuse detected — revoking all sessions', {
      userId: anyToken.user_id,
      ipAddress: context.ipAddress,
    })
    await authRepo.revokeAllUserTokens(anyToken.user_id)
    throw AppError.unauthorized('Session invalidated — please log in again')
  }

  // Check expiry explicitly (belt-and-suspenders; the DB query also filters)
  if (new Date(anyToken.expires_at) < new Date()) {
    throw AppError.unauthorized('Refresh token has expired')
  }

  // ── ROTATE ────────────────────────────────────────────────────────────────
  // Immediately revoke the old token before issuing the new pair.
  // If issueTokenPair fails, the old token is already gone — client must re-login.
  // This is intentional: it's safer to force a re-login than to keep a potentially
  // compromised token alive.
  await authRepo.revokeRefreshToken(anyToken.token_id)

  // Fetch fresh user data — role may have changed since last login
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, company_role, is_active, account_id')
    .eq('id', anyToken.user_id)
    .single()

  if (profileError || !profile) throw AppError.unauthorized('User not found')
  if (!profile.is_active) throw AppError.forbidden('Account has been deactivated')

  const { data: authUser } = await supabase.auth.admin.getUserById(anyToken.user_id)
  const email = authUser.user?.email ?? ''

  const companyRole = (profile.company_role ?? null) as CompanyRole
  return issueTokenPair(anyToken.user_id, email, profile.role as UserRole, profile.account_id, companyRole, context)
}

// ── POST /auth/logout ──────────────────────────────────────────────────────────
export async function logout(userId: string, dto: LogoutDto) {
  if (dto.allDevices) {
    // Revoke every active session for this user
    await authRepo.revokeAllUserTokens(userId)
    return { message: 'Logged out from all devices' }
  }

  if (dto.refreshToken) {
    // Revoke only the specific token that was passed
    const tokenHash = hashRefreshToken(dto.refreshToken)
    const { data: token } = await authRepo.findRefreshTokenByHash(tokenHash)
    if (token && token.user_id === userId) {
      await authRepo.revokeRefreshToken(token.token_id)
    }
    return { message: 'Logged out successfully' }
  }

  // No token provided: revoke all as a safe fallback
  await authRepo.revokeAllUserTokens(userId)
  return { message: 'Logged out successfully' }
}

// ── GET /auth/me ───────────────────────────────────────────────────────────────
// Returns FRESH profile data from DB, not just decoded JWT claims.
// Important: role in JWT may lag behind DB if an admin just changed it.
// This endpoint always reflects the current state.
export async function getMe(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, company_role, full_name, phone, avatar_url, account_id, is_active, is_approved, created_at')
    .eq('id', userId)
    .single()

  if (error || !data) throw AppError.notFound('User')
  if (!data.is_active) throw AppError.forbidden('Account has been deactivated')

  const { data: authUser } = await supabase.auth.admin.getUserById(userId)

  return {
    id:          data.id,
    email:       authUser.user?.email ?? '',
    role:        data.role,
    companyRole: data.company_role ?? null,
    fullName:    data.full_name,
    phone:       data.phone,
    avatarUrl:   data.avatar_url,
    accountId:   data.account_id,
    isApproved:  data.is_approved ?? false,
    createdAt:   data.created_at,
  }
}

// ── POST /auth/register ────────────────────────────────────────────────────────
export async function register(
  dto: RegisterDto,
  context: { ipAddress?: string; userAgent?: string } = {},
) {
  // Use admin API to skip email confirmation — backend-managed registration flow
  const { data, error } = await supabase.auth.admin.createUser({
    email: dto.email,
    password: dto.password,
    email_confirm: true,
    user_metadata: { full_name: dto.fullName },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
      throw AppError.conflict('An account with this email already exists')
    }
    throw AppError.badRequest(error.message)
  }

  const userId = data.user!.id

  // Create an account (company) for the new shipper
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .insert({ account_name: dto.company, created_by: userId })
    .select('account_id')
    .single()

  if (accountError || !account) {
    const pgCode    = (accountError as { code?: string } | null)?.code
    const pgMessage = accountError?.message ?? 'unknown'
    const pgHint    = (accountError as { hint?: string } | null)?.hint
    const pgDetails = (accountError as { details?: string } | null)?.details

    logger.error('Account insert failed during registration', {
      userId,
      pgCode,
      pgMessage,
      pgHint,
      pgDetails,
    })

    await supabase.auth.admin.deleteUser(userId)

    // Unique constraint violation — check which column/index triggered it
    if (pgCode === '23505') {
      const detail = pgDetails ?? pgMessage
      if (detail.includes('account_name') || detail.includes('idx_accounts_name')) {
        throw AppError.conflict('A company with this name already exists')
      }
      throw AppError.conflict('A company account with this name already exists')
    }
    // Foreign-key violation: created_by ref is somehow invalid
    if (pgCode === '23503') {
      throw AppError.internal('Failed to link company account to your user — please try again')
    }
    // Insufficient privilege (would only happen if service-role key is misconfigured)
    if (pgCode === '42501') {
      throw AppError.internal('Server configuration error: insufficient database permissions')
    }
    // Not-null violation: a required column is missing a value
    if (pgCode === '23502') {
      throw AppError.badRequest(`Company account is missing a required field: ${pgDetails ?? pgMessage}`)
    }

    throw AppError.internal('Failed to create company account — please try again or contact support')
  }

  // Link the profile to the new account, set company_admin role, and persist phone
  const profileUpdates: Record<string, unknown> = {
    account_id:   account.account_id,
    company_role: 'company_admin',
  }
  if (dto.phone) profileUpdates.phone = dto.phone

  await supabase.from('profiles').update(profileUpdates).eq('id', userId)

  // Issue a token pair so the client can be logged in immediately after registration
  const tokens = await issueTokenPair(
    userId,
    data.user!.email!,
    'shipper',
    account.account_id,
    'company_admin',
    context,
  )

  return {
    ...tokens,
    user: {
      id:          userId,
      email:       data.user!.email!,
      role:        'shipper' as const,
      companyRole: 'company_admin' as const,
      fullName:    dto.fullName,
      avatarUrl:   null,
      accountId:   account.account_id,
    },
  }
}

// ── POST /auth/change-password ─────────────────────────────────────────────────
// Demonstrates bcrypt verification for password-change flows.
// Supabase reauthentication is used here to verify the current password
// (which internally compares bcrypt hashes), then updates to the new password.
export async function changePassword(userId: string, dto: ChangePasswordDto) {
  // Re-authenticate with current password to prove identity before allowing
  // a password change. This prevents an attacker with a stolen session token
  // from silently changing the password.
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  if (!authUser.user?.email) throw AppError.notFound('User')

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password: dto.currentPassword,
  })

  if (verifyError) {
    throw AppError.unauthorized('Current password is incorrect')
  }

  // If you manage passwords outside Supabase (custom user table), use:
  //   const stored = await db.users.findPasswordHash(userId)
  //   const valid  = await verifyPassword(dto.currentPassword, stored)
  //   if (!valid) throw AppError.unauthorized('Current password is incorrect')
  //   const newHash = await hashPassword(dto.newPassword)
  //   await db.users.updatePasswordHash(userId, newHash)
  //
  // The hashPassword() and verifyPassword() utilities in src/lib/token.ts
  // use bcrypt with cost factor 12 for exactly this purpose.

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: dto.newPassword,
  })

  if (updateError) throw AppError.internal('Failed to update password')

  // Revoke all existing sessions — forcing re-login everywhere
  // This is best practice after a password change.
  await authRepo.revokeAllUserTokens(userId)

  return { message: 'Password changed. Please log in again.' }
}
