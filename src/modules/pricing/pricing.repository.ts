import { supabase } from '../../services/supabase.service'

const WEIGHT_RATE_KEY = 'weight_per_kg_rate'

export async function getWeightRate() {
  return supabase.from('pricing_settings').select('key, label, value, unit, updated_at').eq('key', WEIGHT_RATE_KEY).maybeSingle()
}

export async function updateWeightRate(value: number) {
  return supabase
    .from('pricing_settings')
    .update({ value })
    .eq('key', WEIGHT_RATE_KEY)
    .select('key, label, value, unit, updated_at')
    .single()
}
