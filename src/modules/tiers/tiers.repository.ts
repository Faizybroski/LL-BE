import { supabase } from '../../services/supabase.service'

const SELECT = 'tier_id, rank, slug, name, min_deliveries, benefits, quote_turnaround, created_at, updated_at'

export async function findAll() {
  return supabase
    .from('customer_tiers')
    .select(SELECT)
    .order('rank', { ascending: true })
}

export async function findById(id: string) {
  return supabase
    .from('customer_tiers')
    .select(SELECT)
    .eq('tier_id', id)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('customer_tiers')
    .update(updates)
    .eq('tier_id', id)
    .select(SELECT)
    .single()
}
