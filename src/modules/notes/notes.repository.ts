import { supabase } from '../../services/supabase.service'
import type { ListNotesQuery } from './notes.schema'

const TABLE = 'notes'

export async function findAll(query: ListNotesQuery) {
  return supabase
    .from(TABLE)
    .select('*, profiles ( id, full_name )', { count: 'exact' })
    .eq('entity_type', query.entityType)
    .eq('entity_id', query.entityId)
    .is('deleted_at', null)
    .range((query.page - 1) * query.limit, query.page * query.limit - 1)
    .order('created_at', { ascending: false })
}

export async function create(data: Record<string, unknown>) {
  return supabase.from(TABLE).insert(data).select('*, profiles ( id, full_name )').single()
}

export async function deleteById(id: string, userId: string) {
  return supabase.from(TABLE).delete({ count: 'exact' }).eq('note_id', id).eq('created_by', userId)
}

export async function deleteByIdAdmin(id: string) {
  return supabase.from(TABLE).delete({ count: 'exact' }).eq('note_id', id)
}
