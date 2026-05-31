import { supabase } from '../../services/supabase.service'
import type { ListUsersQuery } from './users.schema'

export async function findById(id: string) {
  return supabase.from('profiles').select('*').eq('id', id).single()
}

export async function findAll(query: ListUsersQuery) {
  let q = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .range((query.page - 1) * query.limit, query.page * query.limit - 1)
    .order('created_at', { ascending: false })

  if (query.role)   q = q.eq('role', query.role)

  if (query.search) {
    const s = query.search.replace(/[(),]/g, '').slice(0, 100)
    q = q.or(`full_name.ilike.%${s}%`)
  }

  return q
}

export async function updateById(id: string, updates: Record<string, unknown>) {
  return supabase.from('profiles').update(updates).eq('id', id).select().single()
}
