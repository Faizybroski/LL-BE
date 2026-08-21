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

// ROOT CAUSE (found via the diagnostics below): this backend runs as a Vercel
// serverless function (see backend/api/index.ts + vercel.json). Vercel keeps
// warm containers alive between requests but FREEZES their JS execution in
// between — no timers run while frozen. The `supabase` client below is a
// module-level singleton, so its outbound fetch keep-alive socket persists
// across invocations on the same warm container. While frozen, undici's own
// idle-socket eviction timer can't fire, but Supabase's server side closes
// the idle socket on its own clock regardless. On the next invocation the
// frozen process still thinks that socket is good, tries to reuse it, and
// the write fails immediately with a connection-reset-class error — surfaced
// to callers as a generic "Failed to ..." 500. A redeploy/restart clears it
// only because the new process has no stale pooled sockets — until the next
// idle gap reproduces it. This is a known Vercel + Node fetch/undici gotcha
// for any client kept alive across warm invocations.
//
// Fix: this failure mode always happens BEFORE any bytes reach the server
// (the write to the already-dead socket fails instantly), so the original
// request never took effect — a retry on a fresh connection is always safe,
// including for writes. One retry, only for errors classifyConnectionError
// recognizes as connection-level (not application/validation errors).
async function fetchWithConnectionRetry(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    if (!classifyConnectionError(err)) throw err
    logger.warn('Supabase fetch hit a stale connection — retrying once on a fresh socket', {
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      error: (err as Error).message,
    })
    return fetch(input, init)
  }
}

// DIAGNOSTIC ONLY — instruments every outgoing Supabase (PostgREST) HTTP
// call to isolate the intermittent-500 root cause. Calls through to
// fetchWithConnectionRetry (see above) with identical args and
// returns/throws exactly what it returns/throws — this only observes.
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
    const res = await fetchWithConnectionRetry(input, init)
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
