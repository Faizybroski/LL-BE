import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import * as adminEmployeesRepo from './admin-employees.repository'
import type { CreateAdminEmployeeDto, UpdateAdminEmployeeDto, ListAdminEmployeesQuery } from './admin-employees.schema'

// The permission that gates this whole module ('employees.view'/'create'/'edit') is
// necessarily coarse — but changing WHICH role someone holds, or whether they're
// active, is more sensitive than editing their name/phone, so those two actions are
// gated by their own dedicated permissions regardless of what unlocked the route.
interface RequestingUser {
  id: string
  permissions: string[]
}

// ── List employees ────────────────────────────────────────────────────────────
export async function listAdminEmployees(query: ListAdminEmployeesQuery) {
  const { data, count, error } = await adminEmployeesRepo.findAdminEmployees(query.page, query.limit)
  if (error) throw AppError.internal('Failed to fetch employees')

  const profiles = data ?? []
  const emailMap: Record<string, string> = {}

  await Promise.all(
    profiles.map(async (p) => {
      const { data: authUser } = await supabase.auth.admin.getUserById(p.id)
      if (authUser.user?.email) emailMap[p.id] = authUser.user.email
    }),
  )

  return {
    employees: profiles.map((p) => ({ ...p, email: emailMap[p.id] ?? '' })),
    total: count ?? 0,
  }
}

// ── Get one employee ──────────────────────────────────────────────────────────
export async function getAdminEmployee(id: string) {
  const { data, error } = await adminEmployeesRepo.findAdminEmployeeById(id)
  if (error || !data) throw AppError.notFound('Employee')

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return { ...data, email: authUser.user?.email ?? '' }
}

// ── Create employee ───────────────────────────────────────────────────────────
// Creates a Supabase auth user then sets profile fields to grant it internal admin access.
// Minting a new CEO is gated separately from plain 'employees.create' — otherwise
// anyone the CEO grants employee-creation to could hand themselves (or an ally) the
// top role by simply creating a fresh CEO account.
export async function createAdminEmployee(requestingUser: RequestingUser, dto: CreateAdminEmployeeDto) {
  if (dto.adminRole === 'ceo' && !requestingUser.permissions.includes('employees.manage_roles')) {
    throw AppError.forbidden('Creating a CEO-level account requires the "employees.manage_roles" permission')
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email:          dto.email,
    password:       dto.password,
    email_confirm:  true,
    user_metadata:  { full_name: dto.fullName },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already exists')) {
      throw AppError.conflict('An account with this email already exists')
    }
    throw AppError.badRequest(error.message)
  }

  const userId = data.user!.id

  const profileUpdates: Record<string, unknown> = {
    role:        'admin',
    admin_role:  dto.adminRole,
    full_name:   dto.fullName,
    is_approved: true,
  }
  if (dto.phone) profileUpdates.phone = dto.phone

  const { error: profileErr } = await supabase
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId)

  if (profileErr) {
    logger.error('Failed to update admin employee profile after creation', { userId, error: profileErr.message })
    await supabase.auth.admin.deleteUser(userId)
    throw AppError.internal('Failed to set up employee profile')
  }

  const { data: profile } = await adminEmployeesRepo.findAdminEmployeeById(userId)
  return { ...profile, email: dto.email }
}

// ── Update employee ───────────────────────────────────────────────────────────
// Field-level permission checks: the route only requires 'employees.edit' to be
// reachable at all, but changing role or active status needs its own permission —
// otherwise anyone who can edit a name/phone could also silently reassign roles
// or suspend accounts, defeating the granular permission model entirely.
export async function updateAdminEmployee(requestingUser: RequestingUser, id: string, dto: UpdateAdminEmployeeDto) {
  const { data: existing, error: findErr } = await adminEmployeesRepo.findAdminEmployeeById(id)
  if (findErr || !existing) throw AppError.notFound('Employee')

  const updates: Record<string, unknown> = {}

  if (dto.fullName !== undefined || dto.phone !== undefined) {
    if (!requestingUser.permissions.includes('employees.edit')) {
      throw AppError.forbidden('This action requires the "employees.edit" permission')
    }
    if (dto.fullName !== undefined) updates.full_name = dto.fullName
    if (dto.phone    !== undefined) updates.phone     = dto.phone
  }

  if (dto.adminRole !== undefined) {
    if (!requestingUser.permissions.includes('employees.manage_roles')) {
      throw AppError.forbidden('This action requires the "employees.manage_roles" permission')
    }
    if (existing.admin_role === 'ceo' && dto.adminRole !== 'ceo') {
      const { count } = await adminEmployeesRepo.countActiveCeosExcluding(id)
      if (!count || count < 1) {
        throw AppError.badRequest('At least one active CEO must remain — promote another CEO first')
      }
    }
    updates.admin_role = dto.adminRole
  }

  if (dto.isActive !== undefined) {
    if (!requestingUser.permissions.includes('employees.suspend')) {
      throw AppError.forbidden('This action requires the "employees.suspend" permission')
    }
    if (requestingUser.id === id && dto.isActive === false) {
      throw AppError.badRequest('You cannot deactivate your own account')
    }
    if (dto.isActive === false && existing.admin_role === 'ceo') {
      const { count } = await adminEmployeesRepo.countActiveCeosExcluding(id)
      if (!count || count < 1) {
        throw AppError.badRequest('At least one active CEO must remain — promote another CEO first')
      }
    }
    updates.is_active = dto.isActive
  }

  if (Object.keys(updates).length === 0) {
    const { data: authUser } = await supabase.auth.admin.getUserById(id)
    return { ...existing, email: authUser.user?.email ?? '' }
  }

  const { data, error } = await adminEmployeesRepo.updateAdminEmployee(id, updates)
  if (error || !data) throw AppError.internal('Failed to update employee')

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return { ...data, email: authUser.user?.email ?? '' }
}
