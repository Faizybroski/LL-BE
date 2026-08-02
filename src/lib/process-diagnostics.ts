import { logger } from './logger'

// Diagnostics-only module for isolating the intermittent-500 root cause
// (leading hypothesis: stale keep-alive sockets reused by undici/fetch
// after the process/container sits idle). Nothing here changes behavior —
// only observes and logs.

const processStartedAt = Date.now()
let lastActivityAt = processStartedAt
let firstFetchConsumed = false
let firstRequestConsumed = false
let diagnosticsRegistered = false

// Call this every time a request finishes or a Supabase fetch settles —
// it's the shared "something happened" clock used to compute idle gaps.
export function markActivity(): void {
  lastActivityAt = Date.now()
}

export function getIdleMsSinceLastActivity(): number {
  return Date.now() - lastActivityAt
}

export function isFirstFetchSinceStartup(): boolean {
  if (firstFetchConsumed) return false
  firstFetchConsumed = true
  return true
}

export function isFirstRequestSinceStartup(): boolean {
  if (firstRequestConsumed) return false
  firstRequestConsumed = true
  return true
}

export function getProcessUptimeMs(): number {
  return Date.now() - processStartedAt
}

interface ExpandedCause {
  name?: string
  message?: string
  code?: string
  errno?: number
  syscall?: string
  address?: string
  port?: number
  stack?: string
  cause?: ExpandedCause | undefined
}

// undici/fetch errors nest the real socket-level error under `.cause`
// (sometimes 2-3 levels deep). Node's default error logging drops this,
// which is very likely why the real signature isn't in existing logs yet.
export function expandCause(cause: unknown, depth = 0): ExpandedCause | string | undefined {
  if (cause === undefined || cause === null) return undefined
  if (depth > 5) return '[cause chain truncated at depth 5]'
  if (!(cause instanceof Error)) {
    try {
      return JSON.stringify(cause)
    } catch {
      return String(cause)
    }
  }
  const e = cause as Error & {
    code?: string
    errno?: number
    syscall?: string
    address?: string
    port?: number
    cause?: unknown
  }
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    errno: e.errno,
    syscall: e.syscall,
    address: e.address,
    port: e.port,
    stack: e.stack,
    cause: expandCause(e.cause, depth + 1) as ExpandedCause | undefined,
  }
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

const CONNECTION_ERROR_MESSAGE_FRAGMENTS = [
  'fetch failed',
  'other side closed',
  'terminated',
  'socket hang up',
  'network socket disconnected',
]

// Walks err -> err.cause -> err.cause.cause... looking for a known
// connection-reset signature anywhere in the chain.
export function classifyConnectionError(err: unknown): string | null {
  let cur: unknown = err
  let depth = 0
  while (cur instanceof Error && depth < 6) {
    const e = cur as Error & { code?: string }
    if (e.code && CONNECTION_ERROR_CODES.has(e.code)) return e.code
    const msg = (e.message ?? '').toLowerCase()
    for (const frag of CONNECTION_ERROR_MESSAGE_FRAGMENTS) {
      if (msg.includes(frag)) return frag
    }
    cur = (e as Error & { cause?: unknown }).cause
    depth++
  }
  return null
}

function diagnosticErrorFields(err: Error) {
  const e = err as NodeJS.ErrnoException & { cause?: unknown }
  return {
    name: e.name,
    message: e.message,
    stack: e.stack,
    code: e.code,
    errno: e.errno,
    cause: expandCause(e.cause),
    connectionErrorClass: classifyConnectionError(e),
    pid: process.pid,
    uptimeSec: process.uptime(),
    idleMsBeforeThis: getIdleMsSinceLastActivity(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  }
}

// Registers global diagnostic listeners exactly once per process.
// `source` tags which entrypoint registered them (local ts-node vs. the
// Vercel serverless function) so logs from both environments are
// distinguishable. Purely additive: only logs, never calls process.exit
// or otherwise alters what already happens on these events.
export function registerProcessDiagnostics(source: string): void {
  if (diagnosticsRegistered) return
  diagnosticsRegistered = true

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error('DIAGNOSTIC unhandledRejection', { source, ...diagnosticErrorFields(err) })
  })

  process.on('uncaughtException', (err) => {
    logger.error('DIAGNOSTIC uncaughtException', { source, ...diagnosticErrorFields(err) })
  })

  process.on('warning', (warning) => {
    logger.warn('DIAGNOSTIC process warning', {
      source,
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
      pid: process.pid,
      uptimeSec: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })
}
