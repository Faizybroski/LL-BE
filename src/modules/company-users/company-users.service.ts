import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import * as companyUsersRepo from './company-users.repository'
import * as notificationsService from '../notifications/notifications.service'
import type { CreateEmployeeDto, UpdateEmployeeDto, ListEmployeesQuery } from './company-users.schema'

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(
  userId:   string,
  type:     'employee_created' | 'employee_updated',
  title:    string,
  body:     string,
  entityId: string,
): void {
  void notificationsService
    .createNotification({ userId, type, title, body, entityType: 'employee', entityId })
    .catch(() => undefined)
}

// ── List employees ────────────────────────────────────────────────────────────
export async function listEmployees(accountId: string, query: ListEmployeesQuery) {
  const { data, count, error } = await companyUsersRepo.findEmployeesByAccount(
    accountId,
    query.page,
    query.limit,
  )
  if (error) throw AppError.internal('Failed to fetch employees', error)

  // Enrich with email from auth.users
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
export async function getEmployee(id: string, accountId: string) {
  const { data, error } = await companyUsersRepo.findEmployeeById(id, accountId)
  if (error || !data) throw AppError.notFound('Employee')

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return { ...data, email: authUser.user?.email ?? '' }
}

// ── Create employee ───────────────────────────────────────────────────────────
// Creates a Supabase auth user then sets profile fields to link them to the company.
export async function createEmployee(dto: CreateEmployeeDto, accountId: string) {
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
    account_id:   accountId,
    company_role: 'employee',
    full_name:    dto.fullName,
    is_approved:  true,
  }
  if (dto.phone) profileUpdates.phone = dto.phone

  const { error: profileErr } = await supabase
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId)

  if (profileErr) {
    logger.error('Failed to update employee profile after creation', { userId, error: profileErr.message })
    await supabase.auth.admin.deleteUser(userId)
    throw AppError.internal('Failed to set up employee profile', profileErr)
  }

  const { data: profile, error: refetchErr } = await companyUsersRepo.findEmployeeById(userId, accountId)
  if (refetchErr || !profile) {
    logger.error('Employee created but failed to re-fetch profile', { userId, error: refetchErr?.message })
    throw AppError.internal('Employee created but the profile could not be loaded — refresh to see it', refetchErr)
  }

  void notificationsService.notifyAllAdmins(
    'employee_created',
    'New employee added',
    `${dto.fullName} was added as an employee.`,
    'employee',
    userId,
  )

  return { ...profile, email: dto.email }
}

// ── Update employee ───────────────────────────────────────────────────────────
export async function updateEmployee(id: string, dto: UpdateEmployeeDto, accountId: string) {
  // Verify the employee belongs to this company
  const { data: existing, error: findErr } = await companyUsersRepo.findEmployeeById(id, accountId)
  if (findErr || !existing) throw AppError.notFound('Employee')

  const updates: Record<string, unknown> = {}
  if (dto.fullName !== undefined) updates.full_name = dto.fullName
  if (dto.phone    !== undefined) updates.phone     = dto.phone
  if (dto.isActive !== undefined) updates.is_active = dto.isActive

  const { data, error } = await companyUsersRepo.updateEmployee(id, updates)
  if (error || !data) throw AppError.internal('Failed to update employee', error)

  void notificationsService.notifyAllAdmins(
    'employee_updated',
    'Employee updated',
    `${data.full_name as string} (employee) was updated.`,
    'employee',
    id,
  )
  notifyUser(id, 'employee_updated', 'Your profile was updated', 'Your employee profile was updated by your company admin.', id)

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return { ...data, email: authUser.user?.email ?? '' }
}
