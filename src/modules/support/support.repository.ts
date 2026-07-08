import { supabase } from '../../services/supabase.service'
import type { ListCasesQuery } from './support.schema'

const CASES       = 'support_cases'
const COMMENTS    = 'support_case_comments'
const ATTACHMENTS = 'support_case_attachments'
const EVENTS      = 'support_case_events'

const CASE_SELECT = `
  case_id,
  case_number,
  account_id,
  created_by,
  subject,
  description,
  status,
  created_at,
  updated_at,
  accounts ( account_id, account_name, logo_url )
`

// ── Cases ─────────────────────────────────────────────────────────────────────

export async function findAll(query: ListCasesQuery, createdBy?: string) {
  let q = supabase
    .from(CASES)
    .select(CASE_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range((query.page - 1) * query.limit, query.page * query.limit - 1)

  // Shippers only ever see cases they personally raised — not company-wide.
  if (createdBy) q = q.eq('created_by', createdBy)
  if (query.status) q = q.eq('status', query.status)
  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 200)
    q = q.or(`case_number.ilike.%${s}%,subject.ilike.%${s}%`)
  }

  return q
}

export async function findById(id: string) {
  return supabase
    .from(CASES)
    .select(CASE_SELECT)
    .eq('case_id', id)
    .is('deleted_at', null)
    .single()
}

export async function create(data: {
  account_id:  string | null
  created_by:  string
  subject:     string
  description: string
}) {
  return supabase.from(CASES).insert(data).select(CASE_SELECT).single()
}

export async function updateStatus(id: string, status: string) {
  return supabase
    .from(CASES)
    .update({ status })
    .eq('case_id', id)
    .is('deleted_at', null)
    .select(CASE_SELECT)
    .single()
}

export async function update(id: string, data: Record<string, unknown>) {
  return supabase
    .from(CASES)
    .update(data)
    .eq('case_id', id)
    .is('deleted_at', null)
    .select(CASE_SELECT)
    .single()
}

export async function softDelete(id: string) {
  return supabase
    .from(CASES)
    .update({ deleted_at: new Date().toISOString() })
    .eq('case_id', id)
    .is('deleted_at', null)
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function findCommentsByCaseId(caseId: string) {
  return supabase
    .from(COMMENTS)
    .select('comment_id, case_id, author_id, content, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })
}

export async function createComment(data: { case_id: string; author_id: string; content: string }) {
  return supabase.from(COMMENTS).insert(data).select().single()
}

// ── Attachments ───────────────────────────────────────────────────────────────

export async function findAttachmentsByCaseId(caseId: string) {
  return supabase
    .from(ATTACHMENTS)
    .select('attachment_id, case_id, uploaded_by, file_name, file_path, file_size, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
}

export async function createAttachment(data: {
  case_id:     string
  uploaded_by: string
  file_name:   string
  file_path:   string
  file_size?:  number
}) {
  return supabase.from(ATTACHMENTS).insert(data).select().single()
}

// ── Events (case history) ─────────────────────────────────────────────────────

export async function findEventsByCaseId(caseId: string) {
  return supabase
    .from(EVENTS)
    .select('event_id, case_id, event_type, from_status, to_status, note, created_by, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })
}

export async function createEvent(data: {
  case_id:     string
  event_type:  'created' | 'status_changed' | 'attachment_added'
  from_status?: string | null
  to_status?:   string | null
  note?:        string | null
  created_by?:  string | null
}) {
  return supabase.from(EVENTS).insert(data)
}

// ── Author name resolution ─────────────────────────────────────────────────────
// created_by/author_id reference auth.users — PostgREST can't traverse that
// cross-schema FK, so we resolve display names in a second batched query.
export async function findProfileNamesByIds(userIds: string[]) {
  if (userIds.length === 0) return { data: [], error: null }
  return supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)
}

// ── Scoping helpers ────────────────────────────────────────────────────────────
export async function findAccountIdByUserId(userId: string) {
  const { data } = await supabase.from('profiles').select('account_id').eq('id', userId).single()
  return (data?.account_id as string | null) ?? null
}
