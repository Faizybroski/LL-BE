import { supabase } from '../../services/supabase.service'

const SELECT = 'level_id, slug, label, multiplier, is_active, sort_order, created_at, updated_at'

export async function findAll() {
  return supabase.from('service_levels').select(SELECT).order('sort_order', { ascending: true })
}

export async function findById(id: string) {
  return supabase.from('service_levels').select(SELECT).eq('level_id', id).single()
}

export async function findBySlug(slug: string) {
  return supabase.from('service_levels').select(SELECT).eq('slug', slug).maybeSingle()
}

export async function insert(row: Record<string, unknown>) {
  return supabase.from('service_levels').insert(row).select(SELECT).single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase.from('service_levels').update(updates).eq('level_id', id).select(SELECT).single()
}

export async function deleteById(id: string) {
  return supabase.from('service_levels').delete().eq('level_id', id)
}
