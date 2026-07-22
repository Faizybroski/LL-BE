import { supabase } from '../../services/supabase.service'

export async function findPermissionCatalog() {
  return supabase
    .from('permissions')
    .select('key, category, label, sort_order')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
}

export async function findRolePermissionMatrix() {
  return supabase
    .from('admin_role_permissions')
    .select('admin_role, permission_key, granted')
}

export async function findGrant(role: string, permissionKey: string) {
  return supabase
    .from('admin_role_permissions')
    .select('admin_role, permission_key, granted')
    .eq('admin_role', role)
    .eq('permission_key', permissionKey)
    .single()
}

export async function upsertGrant(role: string, permissionKey: string, granted: boolean) {
  return supabase
    .from('admin_role_permissions')
    .update({ granted, updated_at: new Date().toISOString() })
    .eq('admin_role', role)
    .eq('permission_key', permissionKey)
    .select('admin_role, permission_key, granted')
    .single()
}
