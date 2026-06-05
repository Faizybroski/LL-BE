import { supabase } from '../../services/supabase.service'

const EMPLOYEE_SELECT = `
  id,
  email:auth_user ( email ),
  full_name,
  phone,
  avatar_url,
  company_role,
  is_active,
  is_approved,
  account_id,
  created_at,
  updated_at
`

// Supabase doesn't expose auth.users directly via the JS client in joins,
// so we fetch profiles and get the email separately via auth admin API.
const PROFILE_SELECT = `
  id,
  full_name,
  phone,
  avatar_url,
  company_role,
  role,
  is_active,
  is_approved,
  account_id,
  created_at,
  updated_at
`

export async function findEmployeesByAccount(accountId: string, page: number, limit: number) {
  const offset = (page - 1) * limit
  return supabase
    .from('profiles')
    .select(PROFILE_SELECT, { count: 'exact' })
    .eq('account_id', accountId)
    .eq('company_role', 'employee')
    .is('deleted_at', null)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false })
}

export async function findEmployeeById(id: string, accountId: string) {
  return supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', id)
    .eq('account_id', accountId)
    .eq('company_role', 'employee')
    .single()
}

export async function updateEmployee(id: string, updates: Record<string, unknown>) {
  return supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select(PROFILE_SELECT)
    .single()
}
