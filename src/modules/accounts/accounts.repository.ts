import { supabase } from '../../services/supabase.service'
import type { ListAccountsQuery } from './accounts.schema'

// ── Field selects ─────────────────────────────────────────────────────────────
const ACCOUNT_SELECT = `
  account_id,
  account_name,
  account_code,
  abn,
  logo_url,
  contact_name,
  contact_email,
  contact_phone,
  billing_address,
  billing_city,
  billing_state,
  billing_postcode,
  billing_country,
  credit_limit,
  payment_terms,
  is_active,
  created_by,
  created_at,
  updated_at
`

// Profiles for the list view — enough to show company admin + count employees
const ACCOUNT_LIST_PROFILES = `profiles ( id, full_name, phone, company_role, is_approved, created_at )`

// Members are profiles belonging to this account (full detail)
const ACCOUNT_DETAIL_SELECT = `
  ${ACCOUNT_SELECT},
  profiles ( id, full_name, phone, role, company_role, is_active, is_approved, avatar_url, created_at )
`

// Notes — author join is resolved in the service layer (cross-schema FK limitation)
const NOTE_SELECT = `
  note_id,
  content,
  is_internal,
  created_by,
  updated_by,
  created_at,
  updated_at
`

// ── Accounts ──────────────────────────────────────────────────────────────────
export async function findById(id: string) {
  return supabase
    .from('accounts')
    .select(ACCOUNT_DETAIL_SELECT)
    .eq('account_id', id)
    .is('deleted_at', null)
    .single()
}

export async function findAll(query: ListAccountsQuery) {
  const sortField = query.sortBy ?? 'created_at'
  const ascending = query.sortDir === 'asc'

  let q = supabase
    .from('accounts')
    .select(`${ACCOUNT_SELECT}, ${ACCOUNT_LIST_PROFILES}`, { count: 'exact' })
    .is('deleted_at', null)
    .range((query.page - 1) * query.limit, query.page * query.limit - 1)
    .order(sortField, { ascending })

  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 100)
    q = q.or(
      `account_name.ilike.%${s}%,` +
      `account_code.ilike.%${s}%,` +
      `contact_email.ilike.%${s}%`,
    )
  }

  if (query.isActive !== undefined) {
    q = q.eq('is_active', query.isActive === 'true')
  }

  if (query.dateFrom) q = q.gte('created_at', query.dateFrom)
  if (query.dateTo)   q = q.lte('created_at', `${query.dateTo}T23:59:59.999Z`)

  return q
}

export async function create(data: Record<string, unknown>) {
  return supabase
    .from('accounts')
    .insert(data)
    .select(ACCOUNT_SELECT)
    .single()
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('accounts')
    .update(updates)
    .eq('account_id', id)
    .is('deleted_at', null)
    .select(ACCOUNT_SELECT)
    .single()
}

export async function softDeleteById(id: string) {
  return supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('account_id', id)
    .is('deleted_at', null)
}

// ── Account Notes ─────────────────────────────────────────────────────────────
export async function findNotesByAccountId(accountId: string) {
  return supabase
    .from('notes')
    .select(NOTE_SELECT)
    .eq('entity_type', 'account')
    .eq('entity_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
}

export async function findNoteById(noteId: string, accountId: string) {
  return supabase
    .from('notes')
    .select(NOTE_SELECT)
    .eq('note_id', noteId)
    .eq('entity_type', 'account')
    .eq('entity_id', accountId)
    .is('deleted_at', null)
    .single()
}

export async function createNote(data: {
  accountId:  string
  content:    string
  isInternal: boolean
  createdBy:  string
}) {
  return supabase
    .from('notes')
    .insert({
      entity_type: 'account',
      entity_id:   data.accountId,
      content:     data.content,
      is_internal: data.isInternal,
      created_by:  data.createdBy,
    })
    .select(NOTE_SELECT)
    .single()
}

export async function updateNoteById(
  noteId:    string,
  content:   string,
  updatedBy: string,
) {
  return supabase
    .from('notes')
    .update({ content, updated_by: updatedBy })
    .eq('note_id', noteId)
    .is('deleted_at', null)
    .select(NOTE_SELECT)
    .single()
}

export async function softDeleteNoteById(noteId: string) {
  return supabase
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('note_id', noteId)
    .is('deleted_at', null)
}

// ── Author resolution ─────────────────────────────────────────────────────────
// Used by the service layer to attach author names to notes (cross-schema FK
// prevents PostgREST from joining notes.created_by → profiles in one query).
export async function findProfileNamesByIds(userIds: string[]) {
  if (userIds.length === 0) return { data: [], error: null }
  return supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
}

// ── Shipper profile ───────────────────────────────────────────────────────────
export async function findProfileById(userId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url, role, is_active, account_id, created_at, updated_at')
    .eq('id', userId)
    .single()
}

// Returns the Account (company) that the given user belongs to
export async function findAccountByUserId(userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', userId)
    .single()

  if (error || !profile?.account_id) return { data: null, error: error ?? new Error('No account') }

  return supabase
    .from('accounts')
    .select(ACCOUNT_DETAIL_SELECT)
    .eq('account_id', profile.account_id)
    .is('deleted_at', null)
    .single()
}

export async function updateProfileById(userId: string, updates: Record<string, unknown>) {
  return supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, full_name, phone, avatar_url, role, is_active, account_id, created_at, updated_at')
    .single()
}
