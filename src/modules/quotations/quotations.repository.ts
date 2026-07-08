import { supabase } from '../../services/supabase.service'
import type { ListQuotationsQuery } from './quotations.schema'

const TABLE = 'quotations'
const ITEMS = 'quotation_items'

const QUOTATION_SELECT = `
  *,
  profiles ( id, full_name, avatar_url ),
  shipments (
    shipment_id, load_number, origin_city, destination_city,
    account_id, assigned_employee_id,
    accounts ( account_id, account_name, logo_url ),
    profiles!assigned_employee_id ( id, full_name, avatar_url )
  ),
  quotation_items ( * ),
  quotation_acceptances ( acceptance_id, user_id, full_name, company_name, terms_version, accepted_at )
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyQuotationFilters(q: any, query: ListQuotationsQuery): any {
  if (query.status)    q = q.eq('status', query.status)
  if (query.loadId)    q = q.eq('load_id', query.loadId)
  if (query.profileId) q = q.eq('profile_id', query.profileId)
  if (query.issueDateFrom)             q = q.gte('issue_date', query.issueDateFrom)
  if (query.issueDateTo)               q = q.lte('issue_date', query.issueDateTo)
  if (query.expiryDateFrom)            q = q.gte('expiry_date', query.expiryDateFrom)
  if (query.expiryDateTo)              q = q.lte('expiry_date', query.expiryDateTo)
  if (query.totalMin !== undefined)    q = q.gte('total', query.totalMin)
  if (query.totalMax !== undefined)    q = q.lte('total', query.totalMax)
  if (query.hasPdf === 'true')         q = q.not('pdf_url', 'is', null)
  if (query.hasPdf === 'false')        q = q.is('pdf_url', null)
  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 200)
    q = q.or(`quotation_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_company.ilike.%${s}%`)
  }
  return q
}

export async function findAll(
  query: ListQuotationsQuery,
  accountId?: string,
  employeeId?: string,
  excludeDraft?: boolean,
) {
  const sortField = query.sortBy ?? 'created_at'
  const ascending = query.sortDir === 'asc'
  const range     = [(query.page - 1) * query.limit, query.page * query.limit - 1] as const

  // Employee scope: only quotations linked to loads assigned to them
  if (employeeId) {
    const { data: loads } = await supabase
      .from('shipments').select('shipment_id').eq('assigned_employee_id', employeeId)
    const loadIds = (loads ?? []).map((l: { shipment_id: string }) => l.shipment_id)
    if (loadIds.length === 0) return { data: [], count: 0, error: null }

    let eq: any = supabase
      .from(TABLE)
      .select(QUOTATION_SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .order(sortField, { ascending })
      .range(...range)
      .in('load_id', loadIds)

    if (excludeDraft) eq = eq.neq('status', 'draft')

    return applyQuotationFilters(eq, query)
  }

  let q: any = supabase
    .from(TABLE)
    .select(QUOTATION_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order(sortField, { ascending })
    .range(...range)

  if (excludeDraft) q = q.neq('status', 'draft')

  // Company admin scope: quotations linked to company-owned loads OR unlinked docs created by company members
  if (accountId) {
    const [{ data: loads }, { data: profiles }] = await Promise.all([
      supabase.from('shipments').select('shipment_id').eq('account_id', accountId),
      supabase.from('profiles').select('id').eq('account_id', accountId),
    ])
    const loadIds    = (loads    ?? []).map((l: { shipment_id: string }) => l.shipment_id)
    const profileIds = (profiles ?? []).map((p: { id: string })         => p.id)

    if (loadIds.length === 0 && profileIds.length === 0) return { data: [], count: 0, error: null }

    const parts: string[] = []
    if (loadIds.length    > 0) parts.push(`load_id.in.(${loadIds.join(',')})`)
    if (profileIds.length > 0) parts.push(`and(load_id.is.null,profile_id.in.(${profileIds.join(',')}))`)
    q = q.or(parts.join(','))
  }

  return applyQuotationFilters(q, query)
}

// ── Stats (KPI cards) ─────────────────────────────────────────────────────────
// Mirrors the scoping rules in findAll but issues count-only queries per bucket.
export async function getStats(accountId?: string, employeeId?: string, excludeDraft?: boolean) {
  const today = new Date().toISOString().slice(0, 10)

  // Employee scope: only quotations linked to loads assigned to them
  let employeeLoadIds: string[] | undefined
  // Company admin scope: quotations linked to company-owned loads OR unlinked docs created by company members
  let accountScopeOr: string | undefined

  if (employeeId) {
    const { data: loads } = await supabase
      .from('shipments').select('shipment_id').eq('assigned_employee_id', employeeId)
    employeeLoadIds = (loads ?? []).map((l: { shipment_id: string }) => l.shipment_id)
    if (employeeLoadIds.length === 0) {
      return { total: 0, pendingReview: 0, accepted: 0, expired: 0 }
    }
  } else if (accountId) {
    const [{ data: loads }, { data: profiles }] = await Promise.all([
      supabase.from('shipments').select('shipment_id').eq('account_id', accountId),
      supabase.from('profiles').select('id').eq('account_id', accountId),
    ])
    const loadIds    = (loads    ?? []).map((l: { shipment_id: string }) => l.shipment_id)
    const profileIds = (profiles ?? []).map((p: { id: string })         => p.id)
    if (loadIds.length === 0 && profileIds.length === 0) {
      return { total: 0, pendingReview: 0, accepted: 0, expired: 0 }
    }
    const parts: string[] = []
    if (loadIds.length    > 0) parts.push(`load_id.in.(${loadIds.join(',')})`)
    if (profileIds.length > 0) parts.push(`and(load_id.is.null,profile_id.in.(${profileIds.join(',')}))`)
    accountScopeOr = parts.join(',')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scoped(): any {
    let q: any = supabase.from(TABLE).select('*', { count: 'exact', head: true }).is('deleted_at', null)
    if (excludeDraft) q = q.neq('status', 'draft')
    if (employeeLoadIds) {
      q = q.in('load_id', employeeLoadIds)
    } else if (accountScopeOr) {
      q = q.or(accountScopeOr)
    }
    return q
  }

  async function count(build: (q: ReturnType<typeof scoped>) => ReturnType<typeof scoped>): Promise<number> {
    const { count: c, error } = await build(scoped())
    if (error) throw error
    return c ?? 0
  }

  const [total, pendingReview, accepted, expiredExplicit, expiredByDate] = await Promise.all([
    count((q) => q),
    count((q) => q.eq('status', 'sent').or(`expiry_date.is.null,expiry_date.gte.${today}`)),
    count((q) => q.eq('status', 'accepted')),
    count((q) => q.eq('status', 'expired')),
    count((q) => q.eq('status', 'sent').lt('expiry_date', today)),
  ])

  return { total, pendingReview, accepted, expired: expiredExplicit + expiredByDate }
}

// ── Acceptances (audit log) ───────────────────────────────────────────────────
export async function createAcceptance(data: {
  quotation_id:  string
  user_id:       string
  full_name:     string | null
  company_name:  string | null
  ip_address:    string | null
  user_agent:    string | null
  terms_version: string
}) {
  return supabase.from('quotation_acceptances').insert(data).select().single()
}

export async function documentBelongsToCompany(
  loadId: string | null,
  profileId: string,
  accountId: string,
): Promise<boolean> {
  if (loadId) {
    const { data } = await supabase
      .from('shipments').select('shipment_id').eq('shipment_id', loadId).eq('account_id', accountId).maybeSingle()
    return !!data
  }
  const { data } = await supabase
    .from('profiles').select('id').eq('id', profileId).eq('account_id', accountId).maybeSingle()
  return !!data
}

export async function loadBelongsToEmployee(loadId: string, employeeId: string): Promise<boolean> {
  const { data } = await supabase
    .from('shipments')
    .select('shipment_id')
    .eq('shipment_id', loadId)
    .eq('assigned_employee_id', employeeId)
    .maybeSingle()
  return !!data
}

export async function findById(id: string) {
  return supabase
    .from(TABLE)
    .select(QUOTATION_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .single()
}

export async function create(data: Record<string, unknown>) {
  return supabase.from(TABLE).insert(data).select(QUOTATION_SELECT).single()
}

export async function update(id: string, data: Record<string, unknown>) {
  return supabase
    .from(TABLE)
    .update(data)
    .eq('id', id)
    .is('deleted_at', null)
    .select(QUOTATION_SELECT)
    .single()
}

export async function softDelete(id: string) {
  return supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
}

export async function upsertItems(quotationId: string, items: Record<string, unknown>[]) {
  await supabase.from(ITEMS).delete().eq('quotation_id', quotationId)
  if (items.length === 0) return { data: [], error: null }
  return supabase.from(ITEMS).insert(items).select()
}

export async function updatePdfUrl(id: string, pdfUrl: string) {
  return supabase.from(TABLE).update({ pdf_url: pdfUrl }).eq('id', id)
}
