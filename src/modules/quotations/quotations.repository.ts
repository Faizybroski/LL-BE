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
  quotation_items ( * )
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

export async function findAll(query: ListQuotationsQuery, accountId?: string, employeeId?: string) {
  const sortField = query.sortBy ?? 'created_at'
  const ascending = query.sortDir === 'asc'
  const range     = [(query.page - 1) * query.limit, query.page * query.limit - 1] as const

  // Employee scope: only quotations linked to loads assigned to them
  if (employeeId) {
    const { data: loads } = await supabase
      .from('shipments').select('shipment_id').eq('assigned_employee_id', employeeId)
    const loadIds = (loads ?? []).map((l: { shipment_id: string }) => l.shipment_id)
    if (loadIds.length === 0) return { data: [], count: 0, error: null }

    const eq: any = supabase
      .from(TABLE)
      .select(QUOTATION_SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .order(sortField, { ascending })
      .range(...range)
      .in('load_id', loadIds)

    return applyQuotationFilters(eq, query)
  }

  let q: any = supabase
    .from(TABLE)
    .select(QUOTATION_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order(sortField, { ascending })
    .range(...range)

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
