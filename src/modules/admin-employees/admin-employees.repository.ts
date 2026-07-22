import { supabase } from '../../services/supabase.service'

const PROFILE_SELECT = `
  id,
  full_name,
  phone,
  avatar_url,
  admin_role,
  role,
  is_active,
  is_approved,
  created_at,
  updated_at
`

export async function findAdminEmployees(page: number, limit: number) {
  const offset = (page - 1) * limit
  return supabase
    .from('profiles')
    .select(PROFILE_SELECT, { count: 'exact' })
    .eq('role', 'admin')
    .is('deleted_at', null)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false })
}

export async function findAdminEmployeeById(id: string) {
  return supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', id)
    .eq('role', 'admin')
    .single()
}

export async function updateAdminEmployee(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .eq('role', 'admin')
    .select(PROFILE_SELECT)
    .single()
}

// Counts active CEOs other than `excludeId` — used to block demoting/deactivating
// the last remaining CEO, which would lock everyone out of the admin panel.
export async function countActiveCeosExcluding(excludeId: string) {
  return supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('admin_role', 'ceo')
    .eq('is_active', true)
    .neq('id', excludeId)
}
