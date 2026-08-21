import { supabase } from '../../services/supabase.service'

const SELECT = 'charge_id, key, category, label, amount, unit, purpose, is_active, sort_order, created_at, updated_at'

export async function findAll() {
  return supabase.from('additional_charges').select(SELECT).order('sort_order', { ascending: true })
}

export async function findById(id: string) {
  return supabase.from('additional_charges').select(SELECT).eq('charge_id', id).single()
}

export async function findByKey(key: string) {
  return supabase.from('additional_charges').select(SELECT).eq('key', key).maybeSingle()
}

export async function insert(row: Record<string, unknown>) {
  return supabase.from('additional_charges').insert(row).select(SELECT).single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase.from('additional_charges').update(updates).eq('charge_id', id).select(SELECT).single()
}

export async function deleteById(id: string) {
  return supabase.from('additional_charges').delete().eq('charge_id', id)
}
