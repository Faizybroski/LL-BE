import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import * as adminEmployeesRepo from './admin-employees.repository'
import * as adminRolesRepo from '../admin-roles/admin-roles.repository'
import * as notificationsService from '../notifications/notifications.service'
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
  const { data, count, error } = await adminEmployeesRepo.findAdminEmployees(query.page, query.limit, query.role)
  if (error) throw AppError.internal('Failed to fetch employees', error)

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

  const { data: role } = await adminRolesRepo.findRoleBySlug(dto.adminRole)
  if (!role) throw AppError.badRequest(`Unknown role "${dto.adminRole}"`)

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
    throw AppError.internal('Failed to set up employee profile', profileErr)
  }

  const { data: profile, error: refetchErr } = await adminEmployeesRepo.findAdminEmployeeById(userId)
  if (refetchErr || !profile) {
    logger.error('Employee created but failed to re-fetch profile', { userId, error: refetchErr?.message })
    throw AppError.internal('Employee created but the profile could not be loaded — refresh to see it', refetchErr)
  }

  void notificationsService.notifyAllAdmins(
    'admin_employee_created',
    'New internal employee added',
    `${dto.fullName} was added as an internal (${dto.adminRole}) employee.`,
    'admin_employee',
    userId,
    requestingUser.id,
  )

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

  // An employee may always edit their own display fields (name / phone) —
  // otherwise 'employees.edit' (an HR permission) is required. Role and
  // active-status branches below keep their own dedicated permission gates,
  // so self-editing can never escalate a role or un-suspend an account.
  const isSelf = requestingUser.id === id

  if (dto.fullName !== undefined || dto.phone !== undefined) {
    if (!isSelf && !requestingUser.permissions.includes('employees.edit')) {
      throw AppError.forbidden('This action requires the "employees.edit" permission')
    }
    if (dto.fullName !== undefined) updates.full_name = dto.fullName
    if (dto.phone    !== undefined) updates.phone     = dto.phone
  }

  // Password reset — sets a new password on the auth user directly (no email
  // round-trip). Dedicated permission: sensitive enough that plain
  // 'employees.edit' shouldn't grant it. Seeded for CEO + VP only.
  if (dto.password !== undefined) {
    if (!requestingUser.permissions.includes('employees.reset_password')) {
      throw AppError.forbidden('This action requires the "employees.reset_password" permission')
    }
    // Resetting the owner's password is a login-as-CEO vector — keep it to
    // holders of 'employees.manage_roles' (CEO), not every reset_password grantee (VP).
    if (existing.admin_role === 'ceo' && !isSelf && !requestingUser.permissions.includes('employees.manage_roles')) {
      throw AppError.forbidden('Resetting a CEO password requires the "employees.manage_roles" permission')
    }
    const { error: pwErr } = await supabase.auth.admin.updateUserById(id, { password: dto.password })
    if (pwErr) throw AppError.badRequest(pwErr.message)

    void notificationsService.notifyAllAdmins(
      'admin_employee_updated',
      'Employee password reset',
      `The password for ${(existing.full_name as string | null) ?? 'an internal employee'} was reset by an administrator.`,
      'admin_employee',
      id,
      requestingUser.id,
    )
    if (id !== requestingUser.id) {
      void notificationsService.createNotification({
        userId: id,
        type: 'admin_employee_updated',
        title: 'Your password was reset',
        body: 'An administrator set a new password for your account. Sign in with the new password.',
        entityType: 'admin_employee',
        entityId: id,
      }).catch(() => undefined)
    }
  }

  if (dto.adminRole !== undefined) {
    if (!requestingUser.permissions.includes('employees.manage_roles')) {
      throw AppError.forbidden('This action requires the "employees.manage_roles" permission')
    }
    const { data: role } = await adminRolesRepo.findRoleBySlug(dto.adminRole)
    if (!role) throw AppError.badRequest(`Unknown role "${dto.adminRole}"`)
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
  if (error || !data) throw AppError.internal('Failed to update employee', error)

  void notificationsService.notifyAllAdmins(
    'admin_employee_updated',
    'Internal employee updated',
    `${data.full_name as string} (internal employee) was updated.`,
    'admin_employee',
    id,
    requestingUser.id,
  )
  // Tell the affected employee directly when it's their own role or active
  // status that changed — not just the leadership audit trail above.
  if (id !== requestingUser.id && (dto.adminRole !== undefined || dto.isActive !== undefined)) {
    void notificationsService.createNotification({
      userId: id,
      type: 'admin_employee_updated',
      title: dto.isActive === false ? 'Your account was deactivated' : 'Your role was updated',
      body: dto.isActive === false
        ? 'Your internal account was deactivated by an administrator.'
        : `Your role was changed to "${dto.adminRole}".`,
      entityType: 'admin_employee',
      entityId: id,
    }).catch(() => undefined)
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return { ...data, email: authUser.user?.email ?? '' }
}

// ── Delete employee (soft) ────────────────────────────────────────────────────
// Cleans a disabled/dead employee off the dashboard: sets deleted_at +
// is_active=false so they vanish from every list and can no longer log in,
// while deliveries/history that reference them stay intact.
export async function deleteAdminEmployee(requestingUser: RequestingUser, id: string) {
  const { data: existing, error: findErr } = await adminEmployeesRepo.findAdminEmployeeById(id)
  if (findErr || !existing) throw AppError.notFound('Employee')

  if (id === requestingUser.id) {
    throw AppError.badRequest('You cannot delete your own account')
  }
  if (!requestingUser.permissions.includes('employees.delete')) {
    throw AppError.forbidden('This action requires the "employees.delete" permission')
  }
  if (existing.admin_role === 'ceo') {
    const { count } = await adminEmployeesRepo.countActiveCeosExcluding(id)
    if (!count || count < 1) {
      throw AppError.badRequest('At least one active CEO must remain — promote another CEO first')
    }
  }

  const { error } = await adminEmployeesRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to delete employee', error)

  void notificationsService.notifyAllAdmins(
    'admin_employee_updated',
    'Internal employee removed',
    `${(existing.full_name as string | null) ?? 'An internal employee'} was removed from the dashboard.`,
    'admin_employee',
    id,
    requestingUser.id,
  )
  void notificationsService.createNotification({
    userId: id,
    type: 'admin_employee_updated',
    title: 'Your account was removed',
    body: 'Your internal account was removed by an administrator.',
    entityType: 'admin_employee',
    entityId: id,
  }).catch(() => undefined)
}
