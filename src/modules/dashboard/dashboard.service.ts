import { supabase } from '../../services/supabase.service'
import { DELIVERY_STATUSES, type DeliveryStatus } from '../deliveries/deliveries.schema'
import * as trackingService from '../tracking/tracking.service'

// Statuses that represent an actively-moving delivery (not yet terminal)
const ACTIVE_STATUSES: DeliveryStatus[] = [
  'pending', 'confirmed', 'assigned', 'picked_up', 'in_transit', 'out_for_delivery',
]

export interface StatusCounts extends Record<DeliveryStatus, number> {}

export interface TrendPoint {
  date:  string  // YYYY-MM-DD
  count: number
}

export interface DashboardStats {
  byStatus:             StatusCounts
  total:                number
  activeDeliveries:          number
  // 30-day sparkline data (index 0 = 30 days ago, index 29 = today)
  trend:                TrendPoint[]
  // Previous 30-day total — used by frontend to compute growth %
  prevPeriodTotal:      number
  recentTrackingEvents: unknown[]
  // Admin-only
  totalCorporates?:       number
  pendingApprovals?:    number
  invoicesDue?:         number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getDashboardStats(
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
): Promise<DashboardStats> {
  // Date boundaries
  const today       = new Date()
  today.setHours(23, 59, 59, 999)
  const periodStart = daysAgo(29)   // start of current 30-day window
  const prevStart   = daysAgo(59)   // start of previous 30-day window

  // Build a scoped, filtered base query for this user/account.
  // select() must be called here — filter methods (.is, .eq, etc.) are only
  // available on PostgrestFilterBuilder, which is returned by .select(), not
  // by .from() alone (PostgrestQueryBuilder has no filter methods in v2).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildBase(columns: string, opts?: object): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from('shipments').select(columns, opts).is('deleted_at', null)
    if (!isAdmin) {
      if (isResidential && userId) {
        // Residential customer: only deliveries linked directly to them
        q = q.eq('customer_id', userId)
      } else if (accountId && userId) {
        q = q.or(`account_id.eq.${accountId},created_by.eq.${userId}`)
      } else if (accountId) {
        q = q.eq('account_id', accountId)
      } else if (userId) {
        q = q.eq('created_by', userId)
      }
    }
    return q
  }

  // ── Parallel queries ──────────────────────────────────────────────────────

  // 1. One COUNT per status (exact, no row fetch)
  const statusCountPromises = DELIVERY_STATUSES.map((s) =>
    buildBase('shipment_id', { count: 'exact', head: true })
      .eq('status', s) as Promise<{ count: number | null; error: unknown }>
  )

  // 2. created_at for the past 60 days (trend + previous period)
  const trendPromise = buildBase('created_at')
    .gte('created_at', prevStart.toISOString())
    .lte('created_at', today.toISOString()) as Promise<{ data: Array<{ created_at: string }> | null; error: unknown }>

  // 3. Admin-only: active corporate accounts + pending approvals
  const corporatesPromise: Promise<{ count: number | null }> = isAdmin
    ? (supabase.from('accounts').select('account_id', { count: 'exact', head: true }).eq('is_active', true) as any)
    : Promise.resolve({ count: 0 })

  const pendingPromise: Promise<{ count: number | null }> = isAdmin
    ? (supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('role', 'corporate')
        .eq('is_approved', false) as any)
    : Promise.resolve({ count: 0 })

  // Invoices still awaiting payment — unpaid, partially paid, or overdue with a balance outstanding.
  const invoicesDuePromise: Promise<{ count: number | null }> = isAdmin
    ? (supabase.from('invoices').select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['unpaid', 'partially_paid', 'overdue'])
        .gt('balance_due', 0) as any)
    : Promise.resolve({ count: 0 })

  const recentTrackingPromise = trackingService.getRecentEvents(isAdmin, accountId, userId, companyRole, 5, isResidential)
    .catch(() => [] as unknown[])

  const [statusResults, trendResult, corporatesResult, pendingResult, invoicesDueResult, recentTracking] = await Promise.all([
    Promise.all(statusCountPromises),
    trendPromise,
    corporatesPromise,
    pendingPromise,
    invoicesDuePromise,
    recentTrackingPromise,
  ])

  // ── Aggregate status counts ───────────────────────────────────────────────

  const byStatus = {} as StatusCounts
  DELIVERY_STATUSES.forEach((s, i) => {
    byStatus[s] = statusResults[i].count ?? 0
  })

  const total       = (Object.values(byStatus) as number[]).reduce((a: number, b: number) => a + b, 0)
  const activeDeliveries = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0)

  // ── Build trend + previous period ─────────────────────────────────────────

  const rows = trendResult.data ?? []
  const trendMap: Record<string, number> = {}
  for (const row of rows) {
    const d = row.created_at.slice(0, 10)
    trendMap[d] = (trendMap[d] ?? 0) + 1
  }

  // 30-day sparkline (day 0 = 30 days ago, day 29 = today)
  const trend: TrendPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(periodStart)
    d.setDate(periodStart.getDate() + i)
    const date = dayString(d)
    return { date, count: trendMap[date] ?? 0 }
  })

  // Previous 30-day total (days 60→31 ago)
  let prevPeriodTotal = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(prevStart)
    d.setDate(prevStart.getDate() + i)
    prevPeriodTotal += trendMap[dayString(d)] ?? 0
  }

  // ── Assemble result ───────────────────────────────────────────────────────

  const stats: DashboardStats = {
    byStatus,
    total,
    activeDeliveries,
    trend,
    prevPeriodTotal,
    recentTrackingEvents: recentTracking,
  }

  if (isAdmin) {
    stats.totalCorporates    = corporatesResult.count ?? 0
    stats.pendingApprovals = pendingResult.count  ?? 0
    stats.invoicesDue      = invoicesDueResult.count ?? 0
  }

  return stats
}
