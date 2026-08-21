import { supabase } from '../../services/supabase.service'

export async function findBalance(profileId: string) {
  return supabase
    .from('customer_credit_balances')
    .select('profile_id, balance, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle()
}

export async function upsertBalance(profileId: string, balance: number) {
  return supabase
    .from('customer_credit_balances')
    .upsert({ profile_id: profileId, balance, updated_at: new Date().toISOString() })
    .select('profile_id, balance, updated_at')
    .single()
}

export async function insertLedgerEntry(row: Record<string, unknown>) {
  return supabase.from('customer_credit_ledger').insert(row)
}

// Postgres unique-violation code — thrown by the partial unique indexes on
// (shipment_id) where type='earn' and (quotation_id) where type='redeem'
// (migration 054). A duplicate here means a concurrent call already recorded
// this exact earn/redeem, not a real error.
export function isDuplicateLedgerEntry(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export async function findRewardsRuleValue(slug: string) {
  return supabase.from('rewards_rules').select('value').eq('slug', slug).single()
}
