import { supabase } from '../../services/supabase.service'
import type { ListDeliveriesQuery } from './deliveries.schema'

// ── Field projections ─────────────────────────────────────────────────────────
// LIST_SELECT: lean projection for paginated lists — omits heavy text blobs and
// embeds only the current assignment's carrier name for display.
const LIST_SELECT = `
  shipment_id,
  load_number,
  shipment_type,
  service_type,
  service_level,
  package_type,
  preferred_delivery_date,
  status,
  account_id,
  customer_id,
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
  created_by_role,
  created_at,
  updated_at,
  accounts ( account_id, account_name, account_code, logo_url ),
  profiles!created_by ( id, full_name, role, avatar_url ),
  customer:profiles!customer_id ( id, full_name, avatar_url ),
  assignments:delivery_assignments ( employee_id, assigned_at, employee:profiles!employee_id ( id, full_name, avatar_url, admin_role ) )
`

// DETAIL_SELECT: full projection for single-record fetch.
const DETAIL_SELECT = `
  shipment_id,
  load_number,
  shipment_type,
  service_type,
  service_level,
  package_type,
  preferred_delivery_date,
  status,
  account_id,
  customer_id,
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
  created_by_role,
  created_at,
  updated_at,
  accounts ( account_id, account_name, account_code, logo_url, contact_name, contact_email ),
  profiles!created_by ( id, full_name, role, avatar_url ),
  customer:profiles!customer_id ( id, full_name, avatar_url ),
  assignments:delivery_assignments ( employee_id, assigned_at, employee:profiles!employee_id ( id, full_name, avatar_url, admin_role ) )
`

// ── Deliveries ─────────────────────────────────────────────────────────────────
export async function findById(id: string) {
  return supabase
    .from('shipments')
    .select(DETAIL_SELECT)
    .eq('shipment_id', id)
    .is('deleted_at', null)
    .single()
}

export async function findAll(
  query:       ListDeliveriesQuery,
  accountId?:  string | null,
  isAdmin      = false,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
) {
  const offset = (query.page - 1) * query.limit

  const sortField = query.sortBy ?? 'created_at'
  const ascending = query.sortDir === 'asc'

  let q = supabase
    .from('shipments')
    .select(LIST_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .range(offset, offset + query.limit - 1)
    .order(sortField, { ascending })

  // ── RBAC scoping ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    if (isResidential && userId) {
      // Residential customers see only deliveries linked directly to them
      q = q.eq('customer_id', userId)
    } else {
      // Corporate customers see all deliveries belonging to their account OR created by them
      // (corporate accounts have no employees of their own — one login per account)
      if (accountId && userId) {
        q = q.or(`account_id.eq.${accountId},created_by.eq.${userId}`)
      } else if (accountId) {
        q = q.eq('account_id', accountId)
      } else if (userId) {
        q = q.eq('created_by', userId)
      }
    }
  } else if (isAdmin && query.accountId) {
    q = q.eq('account_id', query.accountId)
  } else if (isAdmin && query.customerId) {
    q = q.eq('customer_id', query.customerId)
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  if (query.statuses)      q = q.in('status', query.statuses.split(',').map(s => s.trim()).filter(Boolean))
  else if (query.status)   q = q.eq('status', query.status)
  if (query.deliveryType)  q = q.eq('shipment_type', query.deliveryType)
  if (query.createdByRole) q = q.eq('created_by_role', query.createdByRole)
  if (query.dateFrom)      q = q.gte('created_at', query.dateFrom)
  if (query.dateTo)        q = q.lte('created_at', `${query.dateTo}T23:59:59.999Z`)
  if (query.updatedFrom)   q = q.gte('updated_at', query.updatedFrom)
  if (query.updatedTo)     q = q.lte('updated_at', `${query.updatedTo}T23:59:59.999Z`)

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
export async function findStatusHistory(deliveryId: string, limit = 20) {
  return supabase
    .from('shipment_status_history')
    .select('history_id, old_status, new_status, changed_by, reason, created_at')
    .eq('shipment_id', deliveryId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

// Inserts a history entry directly — used when the service needs to record a
// reason or the correct changed_by that the DB trigger cannot capture.
export async function insertStatusHistoryEntry(entry: {
  deliveryId: string
  oldStatus:  string | null
  newStatus:  string
  changedBy:  string
  reason?:    string
}) {
  return supabase.from('shipment_status_history').insert({
    shipment_id: entry.deliveryId,
    old_status:  entry.oldStatus,
    new_status:  entry.newStatus,
    changed_by:  entry.changedBy,
    reason:      entry.reason ?? null,
  })
}

// ── Assignments (many-to-many: a delivery can have several staff on it at once) ─
export async function findAssignedDeliveryIds(employeeId: string): Promise<string[]> {
  const { data } = await supabase
    .from('delivery_assignments')
    .select('delivery_id')
    .eq('employee_id', employeeId)
  return (data ?? []).map((r) => r.delivery_id as string)
}

// Replaces the delivery's whole assignee set — simplest correct semantics
// for a multi-select "who's on this" picker (submits the full new list,
// not incremental add/remove).
export async function setAssignments(deliveryId: string, employeeIds: string[], assignedBy: string) {
  const { error: deleteError } = await supabase
    .from('delivery_assignments')
    .delete()
    .eq('delivery_id', deliveryId)
  if (deleteError) return { error: deleteError }

  if (employeeIds.length === 0) return { error: null }

  return supabase.from('delivery_assignments').insert(
    employeeIds.map((employeeId) => ({ delivery_id: deliveryId, employee_id: employeeId, assigned_by: assignedBy })),
  )
}
