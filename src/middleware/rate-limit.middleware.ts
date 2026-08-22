import rateLimit from 'express-rate-limit'

const windowMs = 15 * 60 * 1000 // 15 minutes

// No blanket app-wide limiter — this is an authenticated internal
// dashboard, not a public API; a single IP-keyed bucket over every route
// was producing 429s from ordinary multi-tab usage (see app.ts). Only
// login/MFA — the actual brute-force surface — stay rate-limited.
export const authLimiter = rateLimit({
  windowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many auth attempts', code: 'RATE_LIMITED' } },
})
