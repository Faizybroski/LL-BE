import { supabase } from '../../services/supabase.service'
import type { ListContactMessagesQuery } from './contact.schema'

const MESSAGES = 'contact_messages'

const MESSAGE_SELECT = `
  id,
  name,
  email,
  phone,
  subject,
  message,
  status,
  created_at,
  updated_at
`

export async function insertMessage(data: {
  name:    string
  email:   string
  phone?:  string
  subject: string
  message: string
}) {
  return supabase.from(MESSAGES).insert(data).select(MESSAGE_SELECT).single()
}

export async function findAll(query: ListContactMessagesQuery) {
  let q = supabase
    .from(MESSAGES)
    .select(MESSAGE_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((query.page - 1) * query.limit, query.page * query.limit - 1)

  if (query.status) q = q.eq('status', query.status)
  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 200)
    q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,subject.ilike.%${s}%`)
  }

  return q
}

export async function findById(id: string) {
  return supabase.from(MESSAGES).select(MESSAGE_SELECT).eq('id', id).single()
}

export async function updateStatus(id: string, status: string) {
  return supabase
    .from(MESSAGES)
    .update({ status })
    .eq('id', id)
    .select(MESSAGE_SELECT)
    .single()
}
