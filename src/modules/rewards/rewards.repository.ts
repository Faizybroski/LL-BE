import { supabase } from '../../services/supabase.service'

const SELECT = 'rule_id, rank, slug, title, description, value, unit, is_editable, created_at, updated_at'

export async function findAll() {
  return supabase
    .from('rewards_rules')
    .select(SELECT)
    .order('rank', { ascending: true })
}

export async function findById(id: string) {
  return supabase
    .from('rewards_rules')
    .select(SELECT)
    .eq('rule_id', id)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('rewards_rules')
    .update(updates)
    .eq('rule_id', id)
    .select(SELECT)
    .single()
}
