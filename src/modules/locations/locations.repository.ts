import { supabase } from '../../services/supabase.service'
import type { ListLocationsQuery } from './locations.schema'

const SELECT = 'id, city, province, latitude, longitude, is_active, created_at, updated_at'

export async function findById(id: string) {
  return supabase
    .from('locations')
    .select(SELECT)
    .eq('id', id)
    .eq('is_active', true)
    .single()
}

export async function findAll(query: ListLocationsQuery) {
  const offset    = (query.page - 1) * query.limit
  const sortField = query.sortBy ?? 'city'
  const ascending = query.sortDir !== 'desc'

  let q = supabase
    .from('locations')
    .select(SELECT, { count: 'exact' })
    .eq('is_active', true)
    .range(offset, offset + query.limit - 1)
    .order(sortField, { ascending })

  if (sortField !== 'city') {
    q = q.order('city', { ascending: true })
  }

  if (query.province) {
    q = q.ilike('province', query.province)
  }

  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 100)
    q = q.or(`city.ilike.%${s}%,province.ilike.%${s}%`)
  }

  return q
}

export async function findByCity(search: string, limit = 20) {
  return supabase
    .from('locations')
    .select(SELECT)
    .eq('is_active', true)
    .ilike('city', `%${search}%`)
    .order('city', { ascending: true })
    .limit(limit)
}

export async function checkDuplicate(city: string, province: string, excludeId?: string) {
  let q = supabase
    .from('locations')
    .select('id')
    .ilike('city', city)
    .ilike('province', province)
    .eq('is_active', true)
  if (excludeId) {
    q = q.neq('id', excludeId)
  }
  return q.maybeSingle()
}

export async function create(data: { city: string; province: string }) {
  return supabase
    .from('locations')
    .insert({ city: data.city, province: data.province })
    .select(SELECT)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('locations')
    .update(updates)
    .eq('id', id)
    .eq('is_active', true)
    .select(SELECT)
    .single()
}

export async function softDeleteById(id: string) {
  return supabase
    .from('locations')
    .update({ is_active: false })
    .eq('id', id)
}

export async function countUsage(locationId: string) {
  return supabase
    .from('load_tracking_events')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)
}
