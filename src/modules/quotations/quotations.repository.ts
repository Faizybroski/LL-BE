import { supabase } from '../../services/supabase.service'
import type { ListQuotationsQuery } from './quotations.schema'

const TABLE = 'quotations'
const ITEMS = 'quotation_items'

const QUOTATION_SELECT = `
  *,
  profiles ( id, full_name ),
  shipments ( shipment_id, load_number, origin_city, destination_city ),
  quotation_items ( * )
`

export async function findAll(query: ListQuotationsQuery, accountId?: string) {
  let q = supabase
    .from(TABLE)
    .select(QUOTATION_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range((query.page - 1) * query.limit, query.page * query.limit - 1)

  if (query.status)    q = q.eq('status', query.status)
  if (query.loadId)    q = q.eq('load_id', query.loadId)
  if (query.profileId) q = q.eq('profile_id', query.profileId)

  if (accountId) {
    const { data: profiles } = await supabase
      .from('profiles').select('id').eq('account_id', accountId)
    const ids = (profiles ?? []).map((p: { id: string }) => p.id)
    q = q.in('profile_id', ids)
  }

  if (query.search) {
    q = q.or(
      `quotation_number.ilike.%${query.search}%,customer_name.ilike.%${query.search}%,customer_company.ilike.%${query.search}%`,
    )
  }

  return q
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
