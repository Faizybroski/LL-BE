import rateLimit from 'express-rate-limit'

const windowMs = 15 * 60 * 1000 // 15 minutes

export const defaultLimiter = rateLimit({
  windowMs,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
})

export const authLimiter = rateLimit({
  windowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many auth attempts', code: 'RATE_LIMITED' } },
})
