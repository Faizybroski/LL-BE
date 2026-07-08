import { supabase } from '../../services/supabase.service'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StoredRefreshToken {
  token_id: string
  user_id: string
  token_hash: string
  is_revoked: boolean
  expires_at: string
}

// ── Insert a new refresh token ────────────────────────────────────────────────
export async function insertRefreshToken(data: {
  userId: string
  tokenHash: string
  expiresAt: Date
  ipAddress?: string
  userAgent?: string
}) {
  return supabase
    .from('refresh_tokens')
    .insert({
      user_id: data.userId,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt.toISOString(),
      ip_address: data.ipAddress ?? null,
      user_agent: data.userAgent ?? null,
      is_revoked: false,
    })
    .select('token_id')
    .single()
}

// ── Find a valid (non-revoked, non-expired) token by hash ─────────────────────
export async function findValidRefreshToken(tokenHash: string) {
  return supabase
    .from('refresh_tokens')
    .select('token_id, user_id, token_hash, is_revoked, expires_at')
    .eq('token_hash', tokenHash)
    .eq('is_revoked', false)
    .gt('expires_at', new Date().toISOString())
    .single()
}

// ── Find a token by hash regardless of revocation status ─────────────────────
// Used for reuse-detection: if we find a revoked token being replayed,
// we know the token was stolen and must wipe ALL sessions for this user.
export async function findRefreshTokenByHash(tokenHash: string) {
  return supabase
    .from('refresh_tokens')
    .select('token_id, user_id, is_revoked, expires_at')
    .eq('token_hash', tokenHash)
    .single()
}

// ── Revoke a single token ─────────────────────────────────────────────────────
export async function revokeRefreshToken(tokenId: string) {
  return supabase
    .from('refresh_tokens')
    .update({ is_revoked: true, revoked_at: new Date().toISOString() })
    .eq('token_id', tokenId)
}

// ── Revoke ALL tokens for a user (full logout / security wipe) ────────────────
export async function revokeAllUserTokens(userId: string) {
  return supabase
    .from('refresh_tokens')
    .update({ is_revoked: true, revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_revoked', false)
}

// ── Update last_used_at on valid use ─────────────────────────────────────────
export async function touchRefreshToken(tokenId: string) {
  return supabase
    .from('refresh_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token_id', tokenId)
}

// ── Sessions (active refresh tokens) ─────────────────────────────────────────
export async function findActiveSessionsByUser(userId: string) {
  return supabase
    .from('refresh_tokens')
    .select('token_id, token_hash, device_info, ip_address, user_agent, created_at, last_used_at, expires_at')
    .eq('user_id', userId)
    .eq('is_revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('last_used_at', { ascending: false, nullsFirst: false })
}

export async function findSessionById(tokenId: string) {
  return supabase
    .from('refresh_tokens')
    .select('token_id, user_id, is_revoked')
    .eq('token_id', tokenId)
    .single()
}

// ── MFA ───────────────────────────────────────────────────────────────────────
export async function findMfaByUserId(userId: string) {
  return supabase
    .from('profiles')
    .select('mfa_secret, mfa_enabled, mfa_enrolled_at')
    .eq('id', userId)
    .single()
}

export async function setPendingMfaSecret(userId: string, secret: string) {
  return supabase
    .from('profiles')
    .update({ mfa_secret: secret, mfa_enabled: false, mfa_enrolled_at: null })
    .eq('id', userId)
}

export async function enableMfa(userId: string) {
  return supabase
    .from('profiles')
    .update({ mfa_enabled: true, mfa_enrolled_at: new Date().toISOString() })
    .eq('id', userId)
}

export async function disableMfa(userId: string) {
  return supabase
    .from('profiles')
    .update({ mfa_secret: null, mfa_enabled: false, mfa_enrolled_at: null })
    .eq('id', userId)
}
