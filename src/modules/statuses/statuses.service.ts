import { AppError } from '../../lib/errors'
import * as statusesRepo from './statuses.repository'
import * as notificationsService from '../notifications/notifications.service'
import { toSlug, SYSTEM_STATUS_SLUGS, type CreateStatusDto, type UpdateStatusDto, type ListStatusesQuery } from './statuses.schema'

export async function listStatuses(query: ListStatusesQuery) {
  const { data, count, error } = await statusesRepo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch statuses', error)
  return { statuses: data ?? [], total: count ?? 0 }
}

export async function listAllActiveStatuses() {
  const { data, error } = await statusesRepo.findAllActive()
  if (error) throw AppError.internal('Failed to fetch statuses', error)
  return data ?? []
}

export async function searchStatuses(search: string) {
  const { data, error } = await statusesRepo.searchByName(search)
  if (error) throw AppError.internal('Failed to search statuses', error)
  return data ?? []
}

export async function getStatus(id: string) {
  const { data, error } = await statusesRepo.findById(id)
  if (error || !data) throw AppError.notFound('Status')
  return data
}

export async function createStatus(dto: CreateStatusDto) {
  const slug = toSlug(dto.name)
  if (!slug) throw AppError.unprocessable('Status name produced an invalid identifier')

  const { data: existing } = await statusesRepo.checkDuplicateSlug(slug)
  if (existing) throw AppError.conflict(`Status '${dto.name}' already exists`)

  const { data, error } = await statusesRepo.create({
    name:        dto.name,
    slug,
    description: dto.description,
    color:       dto.color,
    type:        'custom',
    is_system:   false,
  })
  if (error) throw AppError.internal('Failed to create status', error)

  void notificationsService.notifyAllAdmins(
    'status_created',
    'New status added',
    `Status "${dto.name}" was created.`,
    'status',
    data.id as string,
  )

  return data
}

export async function updateStatus(id: string, dto: UpdateStatusDto) {
  const { data: existing, error: fetchErr } = await statusesRepo.findById(id)
  if (fetchErr || !existing) throw AppError.notFound('Status')

  if (existing.is_system) throw AppError.forbidden('System statuses cannot be modified')

  const updates: Record<string, unknown> = {}

  if (dto.name !== undefined) {
    const newSlug = toSlug(dto.name)
    const { data: dup } = await statusesRepo.checkDuplicateSlug(newSlug, id)
    if (dup) throw AppError.conflict(`Status '${dto.name}' already exists`)
    updates.name = dto.name
    updates.slug = newSlug
  }

  if (dto.description !== undefined) updates.description = dto.description
  if (dto.color       !== undefined) updates.color       = dto.color
  if (dto.is_active   !== undefined) updates.is_active   = dto.is_active

  const { data, error } = await statusesRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update status', error)

  void notificationsService.notifyAllAdmins(
    'status_updated',
    'Status updated',
    `Status "${data.name as string}" was updated.`,
    'status',
    id,
  )

  return data
}

export async function deleteStatus(id: string) {
  const { data: existing, error: fetchErr } = await statusesRepo.findById(id)
  if (fetchErr || !existing) throw AppError.notFound('Status')

  if (existing.is_system) throw AppError.forbidden('System statuses cannot be deleted')

  const { count, error: countErr } = await statusesRepo.countUsage(existing.slug)
  if (countErr) throw AppError.internal('Failed to check status usage', countErr)
  if ((count ?? 0) > 0) {
    throw AppError.unprocessable(
      'This status is in use by active deliveries. Disable it instead of deleting.',
    )
  }

  const { error } = await statusesRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to delete status', error)
}
