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
