import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT:     z.coerce.number().default(3001),

  // ── Supabase ────────────────────────────────────────────────────────────────
  SUPABASE_URL:              z.string().url({ error: 'SUPABASE_URL must be a valid URL' }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY:         z.string().optional(),

  // ── CORS ────────────────────────────────────────────────────────────────────
  // Comma-separated list: "http://localhost:3000,https://app.logicallinks.com"
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // ── JWT ─────────────────────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .default('dev-secret-change-this-in-production-min32chars'),
  JWT_ACCESS_EXPIRES_IN:    z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  // ── Security ─────────────────────────────────────────────────────────────────
  // Number of trusted reverse proxy hops (Nginx, load balancer).
  // Set to 1 when running behind a single reverse proxy so rate limiting
  // sees the real client IP from X-Forwarded-For, not the proxy IP.
  // Set to 0 in local development (no proxy in front).
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

  // Hard timeout per request — prevents slow clients / DB queries from
  // holding connections indefinitely. 30 s is reasonable for an API.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),

  // ── Observability ────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
  process.exit(1)
}

export const env = parsed.data

// Derived convenience: ALLOWED_ORIGINS as a parsed string array
export const allowedOrigins: string[] = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
