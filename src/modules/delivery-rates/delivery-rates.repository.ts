import { supabase } from '../../services/supabase.service'

const SELECT = 'rate_id, service_type, label, base_fee, per_km_rate, minimum_charge, is_active, created_at, updated_at'

export async function findAll() {
  return supabase.from('delivery_rate_cards').select(SELECT).order('label', { ascending: true })
}

export async function findById(id: string) {
  return supabase.from('delivery_rate_cards').select(SELECT).eq('rate_id', id).single()
}

export async function findByServiceType(serviceType: string) {
  return supabase.from('delivery_rate_cards').select(SELECT).eq('service_type', serviceType).maybeSingle()
}

export async function insert(row: Record<string, unknown>) {
  return supabase.from('delivery_rate_cards').insert(row).select(SELECT).single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase.from('delivery_rate_cards').update(updates).eq('rate_id', id).select(SELECT).single()
}

export async function deleteById(id: string) {
  return supabase.from('delivery_rate_cards').delete().eq('rate_id', id)
}
