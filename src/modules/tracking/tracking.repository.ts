import { supabase } from '../../services/supabase.service'
import type { ListTrackingEventsQuery } from './tracking.schema'

const EVENT_SELECT = `
  id,
  load_id,
  location_id,
  tracking_status,
  notes,
  created_by,
  created_by_role,
  event_timestamp,
  created_at,
  updated_at,
  locations ( id, city, province, latitude, longitude ),
  profiles!created_by ( id, full_name, avatar_url )
`

export async function findById(id: string) {
  return supabase
    .from('load_tracking_events')
    .select(EVENT_SELECT)
    .eq('id', id)
    .single()
}

export async function findByLoad(
  loadId:      string,
  query:       ListTrackingEventsQuery,
) {
  const offset = (query.page - 1) * query.limit

  return supabase
    .from('load_tracking_events')
    .select(EVENT_SELECT, { count: 'exact' })
    .eq('load_id', loadId)
    .range(offset, offset + query.limit - 1)
    .order('event_timestamp', { ascending: false })
}

export async function findRecent(
  isAdmin:      boolean,
  accountId?:   string | null,
  userId?:      string,
  companyRole?: string | null,
  limit         = 10,
) {
  // Use !inner so the embedded-resource filter excludes parent rows
  // that have no matching shipment (dot-notation filters on a plain embed
  // only filter the embedded JSON, not the parent row).
  const embed = isAdmin
    ? 'shipments!load_id ( shipment_id, load_number, account_id, assigned_employee_id )'
    : 'shipments!load_id!inner ( shipment_id, load_number, account_id, assigned_employee_id )'

  let q = supabase
    .from('load_tracking_events')
    .select(`${EVENT_SELECT}, ${embed}`)

  if (!isAdmin) {
    if (companyRole === 'employee' && userId) {
      q = (q as any).eq('shipments.assigned_employee_id', userId)
    } else if (accountId) {
      q = (q as any).eq('shipments.account_id', accountId)
    }
  }

  return q
    .order('event_timestamp', { ascending: false })
    .limit(limit)
}

export async function create(data: Record<string, unknown>) {
  return supabase
    .from('load_tracking_events')
    .insert(data)
    .select(EVENT_SELECT)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('load_tracking_events')
    .update(updates)
    .eq('id', id)
    .select(EVENT_SELECT)
    .single()
}

export async function deleteById(id: string) {
  return supabase
    .from('load_tracking_events')
    .delete()
    .eq('id', id)
}
