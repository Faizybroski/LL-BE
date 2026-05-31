import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { env, allowedOrigins } from './lib/env'
import { requestLogger } from './middleware/request-logger.middleware'
import { defaultLimiter } from './middleware/rate-limit.middleware'
import { timeoutMiddleware } from './middleware/timeout.middleware'
import { notFoundMiddleware } from './middleware/not-found.middleware'
import { errorMiddleware } from './middleware/error.middleware'
import { supabase } from './services/supabase.service'
import { v1Router } from './routes/v1'

export function createApp(): express.Application {
  const app = express()

  // ── Reverse-proxy trust ───────────────────────────────────────────────────
  // Required for rate-limiting to see the real client IP from X-Forwarded-For.
  // Set TRUST_PROXY=1 in production (one hop: Nginx/ALB → app).
  app.set('trust proxy', env.TRUST_PROXY)

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet())
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow server-to-server requests (no origin) and whitelisted origins.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
        callback(new Error(`Origin '${origin}' not allowed by CORS`))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }),
  )

  // ── Performance ───────────────────────────────────────────────────────────
  app.use(compression())

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  // ── Observability ─────────────────────────────────────────────────────────
  app.use(requestLogger)

  // ── Rate limiting ─────────────────────────────────────────────────────────
  app.use(defaultLimiter)

  // ── Request timeout ───────────────────────────────────────────────────────
  app.use(timeoutMiddleware)

  // ── Health checks (no auth, no versioning) ────────────────────────────────
  // /health  → liveness  (is the process running?)
  // /health/ready → readiness (can it serve traffic? DB reachable?)
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: { status: 'ok', timestamp: new Date().toISOString(), version: 'v1' },
    })
  })

  app.get('/health/ready', async (_req, res) => {
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error) {
      return void res.status(503).json({
        success: false,
        data: { status: 'degraded', db: 'unreachable', detail: error.message },
      })
    }
    res.json({ success: true, data: { status: 'ok', db: 'connected' } })
  })

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api/v1', v1Router)

  // ── 404 & error handlers (must be last) ───────────────────────────────────
  app.use(notFoundMiddleware)
  app.use(errorMiddleware)

  return app
}
