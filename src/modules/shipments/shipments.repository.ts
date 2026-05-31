import { supabase } from '../../services/supabase.service'
import type { ListShipmentsQuery } from './shipments.schema'

// ── Field projections ─────────────────────────────────────────────────────────
// LIST_SELECT: lean projection for paginated lists — omits heavy text blobs and
// embeds only the current assignment's carrier name for display.
const LIST_SELECT = `
  shipment_id,
  load_number,
  shipment_type,
  status,
  account_id,
  origin_address,
  origin_city,
  origin_state,
  origin_postcode,
  origin_country,
  destination_address,
  destination_city,
  destination_state,
  destination_postcode,
  destination_country,
  cargo_description,
  weight_kg,
  volume_m3,
  pieces,
  is_dangerous_goods,
  requires_refrigeration,
  estimated_pickup_date,
  estimated_delivery_date,
  actual_delivery_date,
  quoted_price,
  confirmed_price,
  currency,
  special_instructions,
  reference_number,
  created_by,
  created_at,
  updated_at,
  accounts ( account_id, account_name, account_code )
`

// DETAIL_SELECT: full projection for single-record fetch.
const DETAIL_SELECT = `
  shipment_id,
  load_number,
  shipment_type,
  status,
  account_id,
  origin_address,
  origin_city,
  origin_state,
  origin_postcode,
  origin_country,
  destination_address,
  destination_city,
  destination_state,
  destination_postcode,
  destination_country,
  cargo_description,
  weight_kg,
  volume_m3,
  pieces,
  is_dangerous_goods,
  requires_refrigeration,
  estimated_pickup_date,
  estimated_delivery_date,
  actual_pickup_date,
  actual_delivery_date,
  quoted_price,
  confirmed_price,
  currency,
  special_instructions,
  reference_number,
  created_by,
  created_at,
  updated_at,
  accounts ( account_id, account_name, account_code, contact_name, contact_email )
`

// ── Shipments ─────────────────────────────────────────────────────────────────
export async function findById(id: string) {
  return supabase
    .from('shipments')
    .select(DETAIL_SELECT)
    .eq('shipment_id', id)
    .is('deleted_at', null)
    .single()
}

export async function findAll(
  query:     ListShipmentsQuery,
  accountId?: string | null,
  isAdmin    = false,
  userId?:   string,
) {
  const offset = (query.page - 1) * query.limit

  let q = supabase
    .from('shipments')
    .select(LIST_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .range(offset, offset + query.limit - 1)
    .order('created_at', { ascending: false })

  // ── RBAC scoping ──────────────────────────────────────────────────────────
  // Shippers see shipments belonging to their account OR created by them
  // (covers pending loads they created before being assigned an account).
  // Admins can optionally filter by account_id.
  if (!isAdmin) {
    if (accountId && userId) {
      q = q.or(`account_id.eq.${accountId},created_by.eq.${userId}`)
    } else if (accountId) {
      q = q.eq('account_id', accountId)
    } else if (userId) {
      q = q.eq('created_by', userId)
    }
  } else if (isAdmin && query.accountId) {
    q = q.eq('account_id', query.accountId)
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  if (query.status)       q = q.eq('status', query.status)
  if (query.shipmentType) q = q.eq('shipment_type', query.shipmentType)

  // ── Search ────────────────────────────────────────────────────────────────
  // Covers load_number (trigram index), reference_number, origin and dest city.
  // Strip PostgREST OR-clause meta-characters before interpolation to prevent
  // filter-string injection via the search parameter.
  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 100)
    q = q.or(
      `load_number.ilike.%${s}%,` +
      `reference_number.ilike.%${s}%,` +
      `origin_city.ilike.%${s}%,` +
      `destination_city.ilike.%${s}%`,
    )
  }

  return q
}

export async function create(data: Record<string, unknown>) {
  return supabase
    .from('shipments')
    .insert(data)
    .select(DETAIL_SELECT)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('shipments')
    .update(updates)
    .eq('shipment_id', id)
    .is('deleted_at', null)
    .select(DETAIL_SELECT)
    .single()
}

export async function softDeleteById(id: string) {
  return supabase
    .from('shipments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('shipment_id', id)
    .is('deleted_at', null)
}

// ── Status history ────────────────────────────────────────────────────────────
export async function findStatusHistory(shipmentId: string, limit = 20) {
  return supabase
    .from('shipment_status_history')
    .select('history_id, old_status, new_status, changed_by, reason, created_at')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

// Inserts a history entry directly — used when the service needs to record a
// reason or the correct changed_by that the DB trigger cannot capture.
export async function insertStatusHistoryEntry(entry: {
  shipmentId: string
  oldStatus:  string | null
  newStatus:  string
  changedBy:  string
  reason?:    string
}) {
  return supabase.from('shipment_status_history').insert({
    shipment_id: entry.shipmentId,
    old_status:  entry.oldStatus,
    new_status:  entry.newStatus,
    changed_by:  entry.changedBy,
    reason:      entry.reason ?? null,
  })
}
