import { supabase } from '../../services/supabase.service'
import type { ListStatusesQuery } from './statuses.schema'

const SELECT = 'id, name, slug, description, type, color, is_system, is_active, created_at, updated_at'

export async function findById(id: string) {
  return supabase
    .from('statuses')
    .select(SELECT)
    .eq('id', id)
    .single()
}

export async function findBySlug(slug: string) {
  return supabase
    .from('statuses')
    .select(SELECT)
    .eq('slug', slug)
    .single()
}

export async function findAll(query: ListStatusesQuery) {
  const offset    = (query.page - 1) * query.limit
  const sortField = query.sortBy ?? 'name'
  const ascending = query.sortDir !== 'desc'

  let q = supabase
    .from('statuses')
    .select(SELECT, { count: 'exact' })
    .range(offset, offset + query.limit - 1)
    .order('is_system', { ascending: false })  // system records always float to top
    .order(sortField, { ascending })

  if (query.type) {
    q = q.eq('type', query.type)
  }

  if (query.isActive !== undefined) {
    q = q.eq('is_active', query.isActive === 'true')
  }

  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 100)
    q = q.ilike('name', `%${s}%`)
  }

  return q
}

export async function findAllActive() {
  return supabase
    .from('statuses')
    .select(SELECT)
    .eq('is_active', true)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })
}

export async function searchByName(search: string, limit = 30) {
  return supabase
    .from('statuses')
    .select(SELECT)
    .eq('is_active', true)
    .ilike('name', `%${search}%`)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit)
}

export async function checkDuplicateSlug(slug: string, excludeId?: string) {
  let q = supabase
    .from('statuses')
    .select('id')
    .eq('slug', slug)
  if (excludeId) {
    q = q.neq('id', excludeId)
  }
  return q.maybeSingle()
}

export async function create(data: {
  name:        string
  slug:        string
  description?: string
  color?:      string
  type:        'system' | 'custom'
  is_system:   boolean
}) {
  return supabase
    .from('statuses')
    .insert(data)
    .select(SELECT)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('statuses')
    .update(updates)
    .eq('id', id)
    .select(SELECT)
    .single()
}

export async function softDeleteById(id: string) {
  return supabase
    .from('statuses')
    .update({ is_active: false })
    .eq('id', id)
}

export async function countUsage(slug: string) {
  return supabase
    .from('shipments')
    .select('shipment_id', { count: 'exact', head: true })
    .eq('status', slug)
}
