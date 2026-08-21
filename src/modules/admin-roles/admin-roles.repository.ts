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

// ── Role CRUD ──────────────────────────────────────────────────────────────────

export async function findAllRoles() {
  return supabase
    .from('admin_roles')
    .select('slug, label, is_system, sort_order')
    .order('sort_order', { ascending: true })
}

export async function countRoles() {
  return supabase
    .from('admin_roles')
    .select('slug', { count: 'exact', head: true })
}

export async function findRoleBySlug(slug: string) {
  return supabase
    .from('admin_roles')
    .select('slug, label, is_system, sort_order')
    .eq('slug', slug)
    .maybeSingle()
}

export async function insertRole(slug: string, label: string, sortOrder: number) {
  return supabase
    .from('admin_roles')
    .insert({ slug, label, is_system: false, sort_order: sortOrder })
    .select('slug, label, is_system, sort_order')
    .single()
}

export async function updateRoleLabel(slug: string, label: string) {
  return supabase
    .from('admin_roles')
    .update({ label, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select('slug, label, is_system, sort_order')
    .single()
}

export async function deleteRole(slug: string) {
  return supabase.from('admin_roles').delete().eq('slug', slug)
}

export async function countProfilesWithRole(slug: string) {
  return supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('admin_role', slug)
}

export async function insertGrantsForRole(slug: string) {
  const { data: permissions, error } = await supabase.from('permissions').select('key')
  if (error || !permissions) return { error }
  const rows = permissions.map((p) => ({ admin_role: slug, permission_key: p.key, granted: false }))
  return supabase.from('admin_role_permissions').insert(rows)
}
