import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { httpLog, logger } from '../lib/logger'
import { runWithRequestContext } from '../lib/request-context'
import {
  markActivity,
  getIdleMsSinceLastActivity,
  isFirstRequestSinceStartup,
  getProcessUptimeMs,
} from '../lib/process-diagnostics'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string
      startTime: number
    }
  }
}

// DIAGNOSTIC ONLY — request/header/body values below are logged for the
// live root-cause investigation into intermittent 500s. Sensitive values
// are redacted; nothing here changes request handling.
const SENSITIVE_HEADER_KEYS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key'])
const SENSITIVE_BODY_KEY_PATTERN = /pass|token|secret|authoriz|api[-_]?key|credit.?card|ssn/i

function redactHeaders(headers: Request['headers']): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value
  }
  return out
}

function redactBody(body: unknown, depth = 0): unknown {
  if (depth > 4 || body === null || typeof body !== 'object') return body
  if (Array.isArray(body)) return body.map((v) => redactBody(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_BODY_KEY_PATTERN.test(key) ? '[REDACTED]' : redactBody(value, depth + 1)
  }
  return out
}

function isSafeToLogBody(req: Request): boolean {
  const contentType = req.headers['content-type'] ?? ''
  return contentType.includes('application/json') || contentType.includes('application/x-www-form-urlencoded')
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID()
  req.startTime = Date.now()

  res.setHeader('X-Request-Id', req.requestId)

  const idleMsBeforeThisRequest = getIdleMsSinceLastActivity()
  const firstRequestSinceStartup = isFirstRequestSinceStartup()

  logger.debug('DIAGNOSTIC request:start', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    headers: redactHeaders(req.headers),
    body: isSafeToLogBody(req) ? redactBody(req.body) : '[skipped: unsafe content-type]',
    pid: process.pid,
    processUptimeMs: getProcessUptimeMs(),
    idleMsBeforeThisRequest,
    firstRequestSinceStartup,
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  })

  res.on('finish', () => {
    markActivity()
    httpLog(req.method, req.originalUrl, res.statusCode, Date.now() - req.startTime, req.requestId)
  })

  runWithRequestContext(
    { requestId: req.requestId, method: req.method, url: req.originalUrl, startedAt: req.startTime },
    () => next(),
  )
}
