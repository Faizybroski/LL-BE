import { supabase } from '../../services/supabase.service'

const TABLE = 'notifications'

export async function findByUser(
  userId: string,
  page: number,
  limit: number,
  unreadOnly = false,
  types?: readonly string[],
  category?: string,
) {
  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .range((page - 1) * limit, page * limit - 1)
    .order('created_at', { ascending: false })

  if (unreadOnly) q = q.eq('is_read', false)

  // Admin-authored alerts carry a `category` column instead of a dedicated
  // per-module `type`, so a tab filter must match either a "real" event type
  // for that module OR an admin_alert tagged with that category.
  if (types && types.length > 0 && category) {
    q = q.or(`type.in.(${types.join(',')}),and(type.eq.admin_alert,category.eq.${category})`)
  } else if (types && types.length > 0) {
    q = q.in('type', types)
  }

  return q
}

export async function countUnread(userId: string) {
  return supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false)
}

export async function create(data: Record<string, unknown>) {
  return supabase.from(TABLE).insert(data).select().single()
}

export async function createMany(rows: Record<string, unknown>[]) {
  return supabase.from(TABLE).insert(rows).select()
}

export async function markAsRead(ids: string[], userId: string) {
  return supabase
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in('notification_id', ids)
    .eq('user_id', userId)
}

export async function markAllAsRead(userId: string) {
  return supabase
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
}
