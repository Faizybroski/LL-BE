import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as usersRepo from './users.repository'
import * as notificationsService from '../notifications/notifications.service'
import type { UpdateProfileDto, ListUsersQuery, UpdateUserRoleDto, ApproveUserDto } from './users.schema'

// Maps a raw profiles row to the camelCase shape the frontend expects.
// Email is not stored in profiles — callers should pass it when available,
// otherwise it is omitted (undefined).
function formatProfile(row: Record<string, unknown>, email?: string) {
  return {
    id:         row.id as string,
    email:      email ?? (row.email as string | undefined) ?? '',
    role:       row.role as string,
    fullName:   (row.full_name as string | null) ?? null,
    phone:      (row.phone as string | null) ?? null,
    avatarUrl:  (row.avatar_url as string | null) ?? null,
    accountId:  (row.account_id as string | null) ?? null,
    isApproved: (row.is_approved as boolean) ?? false,
    createdAt:  row.created_at as string,
  }
}

export async function getProfile(id: string) {
  const { data, error } = await usersRepo.findById(id)
  if (error || !data) throw AppError.notFound('User')

  // Fetch email from auth.users (not stored in profiles)
  const { data: authUser } = await supabase.auth.admin.getUserById(id)

  return formatProfile(data as Record<string, unknown>, authUser.user?.email)
}

export async function updateProfile(id: string, dto: UpdateProfileDto) {
  const { data, error } = await usersRepo.updateById(id, {
    ...(dto.fullName !== undefined && { full_name: dto.fullName }),
    ...(dto.phone    !== undefined && { phone: dto.phone }),
    ...(dto.avatarUrl !== undefined && { avatar_url: dto.avatarUrl }),
    updated_at: new Date().toISOString(),
  })
  if (error || !data) throw AppError.notFound('User')

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return formatProfile(data as Record<string, unknown>, authUser.user?.email)
}

export async function listUsers(query: ListUsersQuery) {
  const { data, count, error } = await usersRepo.findAll(query)
  if (error) throw AppError.internal('Failed to list users')

  const rows = (data ?? []) as Record<string, unknown>[]

  // Batch-fetch emails from auth.users for all returned profiles
  const { data: { users: authUsers } = { users: [] } } =
    await supabase.auth.admin.listUsers({ perPage: 1000 })

  const emailMap = new Map(authUsers.map((u) => [u.id, u.email ?? '']))

  const users = rows.map((row) =>
    formatProfile(row, emailMap.get(row.id as string)),
  )

  return { users, total: count ?? 0 }
}

export async function updateUserRole(id: string, dto: UpdateUserRoleDto) {
  const { data, error } = await usersRepo.updateById(id, { role: dto.role })
  if (error || !data) throw AppError.notFound('User')

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return formatProfile(data as Record<string, unknown>, authUser.user?.email)
}

export async function approveUser(id: string, dto: ApproveUserDto) {
  const { data, error } = await usersRepo.updateById(id, { is_approved: dto.isApproved })
  if (error || !data) throw AppError.notFound('User')

  if (dto.isApproved) {
    void notificationsService
      .createNotification({
        userId:     id,
        type:       'system',
        title:      'Account approved',
        body:       'Your shipper account has been approved. You now have full access.',
        entityType: 'account',
        entityId:   id,
      })
      .catch(() => undefined)
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(id)
  return formatProfile(data as Record<string, unknown>, authUser.user?.email)
}
