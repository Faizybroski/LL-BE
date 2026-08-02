import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { logger } from '../lib/logger'
import { getRequestContext } from '../lib/request-context'
import {
  markActivity,
  getIdleMsSinceLastActivity,
  isFirstFetchSinceStartup,
  expandCause,
  classifyConnectionError,
} from '../lib/process-diagnostics'

// DIAGNOSTIC ONLY — instruments every outgoing Supabase (PostgREST) HTTP
// call to isolate the intermittent-500 root cause. Calls through to the
// real global fetch with identical args and returns/throws exactly what
// it returns/throws — behavior is unchanged, this only observes.
// See: expandCause / classifyConnectionError in process-diagnostics.ts.
const instrumentedFetch: typeof fetch = async (input, init) => {
  const callId = randomUUID()
  const ctx = getRequestContext()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = init?.method ?? 'GET'
  const idleMsBeforeCall = getIdleMsSinceLastActivity()
  const firstFetchSinceStartup = isFirstFetchSinceStartup()
  const startedAt = Date.now()

  logger.debug('DIAGNOSTIC supabase.fetch:start', {
    callId,
    requestId: ctx?.requestId,
    url,
    method,
    idleMsBeforeCall,
    firstFetchSinceStartup,
    pid: process.pid,
    uptimeSec: process.uptime(),
    timestamp: new Date().toISOString(),
  })

  try {
    const res = await fetch(input, init)
    markActivity()
    logger.debug('DIAGNOSTIC supabase.fetch:end', {
      callId,
      requestId: ctx?.requestId,
      url,
      method,
      durationMs: Date.now() - startedAt,
      status: res.status,
      ok: res.ok,
      timestamp: new Date().toISOString(),
    })
    return res
  } catch (err) {
    markActivity()
    const e = err as Error & { cause?: unknown; code?: string; errno?: number }
    logger.error('DIAGNOSTIC supabase.fetch:error', {
      callId,
      requestId: ctx?.requestId,
      url,
      method,
      durationMs: Date.now() - startedAt,
      idleMsBeforeCall,
      firstFetchSinceStartup,
      name: e.name,
      message: e.message,
      code: e.code,
      errno: e.errno,
      cause: expandCause(e.cause),
      connectionErrorClass: classifyConnectionError(e),
      pid: process.pid,
      uptimeSec: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    })
    throw err // rethrow untouched — diagnostics must not swallow or alter errors
  }
}

// Service role key — bypasses RLS. Used ONLY in backend.
// Never expose this key to the frontend.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      // Use port 6543 (Supavisor transaction mode) in DATABASE_URL
      schema: 'public',
    },
    global: {
      fetch: instrumentedFetch,
    },
  }
)
