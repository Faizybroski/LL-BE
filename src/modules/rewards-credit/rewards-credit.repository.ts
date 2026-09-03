import { supabase } from '../../services/supabase.service'

export async function findBalance(profileId: string) {
  return supabase
    .from('customer_credit_balances')
    .select('profile_id, points_balance, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle()
}

export async function upsertBalance(profileId: string, pointsBalance: number) {
  return supabase
    .from('customer_credit_balances')
    .upsert({ profile_id: profileId, points_balance: pointsBalance, updated_at: new Date().toISOString() })
    .select('profile_id, points_balance, updated_at')
    .single()
}

export async function insertLedgerEntry(row: Record<string, unknown>) {
  return supabase.from('customer_credit_ledger').insert(row)
}

export async function findLedgerHistory(profileId: string, limit: number) {
  return supabase
    .from('customer_credit_ledger')
    .select('ledger_id, points, amount, type, note, created_at, shipment_id, quotation_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

// Postgres unique-violation code — thrown by the partial unique indexes on
// (shipment_id) where type='earn' and (quotation_id) where type='redeem'
// (migration 054). A duplicate here means this exact earn/redeem was
// already recorded, not a real error. (Birthday bonus dedupe is no longer
// index-based — see findLastBirthdayBonus / migration 069.)
export function isDuplicateLedgerEntry(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export async function findRewardsRuleValue(slug: string) {
  return supabase.from('rewards_rules').select('value').eq('slug', slug).single()
}

export async function findDateOfBirth(profileId: string) {
  return supabase.from('profiles').select('date_of_birth').eq('id', profileId).single()
}

export async function findProfileRole(profileId: string) {
  return supabase.from('profiles').select('role').eq('id', profileId).maybeSingle()
}

// Most recent birthday_bonus award for this profile — the gate for the
// rolling 365-day cooldown (migration 069). date_of_birth can be changed
// freely; this is what actually stops repeat awards, not the DOB itself.
export async function findLastBirthdayBonus(profileId: string) {
  return supabase
    .from('customer_credit_ledger')
    .select('created_at')
    .eq('profile_id', profileId)
    .eq('type', 'birthday_bonus')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}
