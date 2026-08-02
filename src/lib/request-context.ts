import { AsyncLocalStorage } from 'async_hooks'

// Lets code deep in the call stack (e.g. the Supabase fetch wrapper) attach
// the originating request's ID to its logs without threading `req` through
// every service/repository function. Diagnostics-only — read-only store.
export interface RequestContext {
  requestId: string
  method: string
  url: string
  startedAt: number
}

const als = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore()
}
