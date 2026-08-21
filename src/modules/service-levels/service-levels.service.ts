import { AppError } from '../../lib/errors'
import * as levelsRepo from './service-levels.repository'
import type { CreateServiceLevelDto, UpdateServiceLevelDto } from './service-levels.schema'

export async function listLevels() {
  const { data, error } = await levelsRepo.findAll()
  if (error) throw AppError.internal('Failed to fetch service levels', error)
  return data ?? []
}

export async function createLevel(dto: CreateServiceLevelDto) {
  const { data: existing } = await levelsRepo.findBySlug(dto.slug)
  if (existing) throw AppError.badRequest(`A service level for "${dto.slug}" already exists`)

  const { data, error } = await levelsRepo.insert({
    slug:       dto.slug,
    label:      dto.label,
    multiplier: dto.multiplier,
  })
  if (error || !data) throw AppError.internal('Failed to create service level', error)
  return data
}

export async function updateLevel(id: string, dto: UpdateServiceLevelDto) {
  const { data: existing } = await levelsRepo.findById(id)
  if (!existing) throw AppError.notFound('Service level')

  const updates: Record<string, unknown> = {}
  if (dto.label      !== undefined) updates.label      = dto.label
  if (dto.multiplier !== undefined) updates.multiplier = dto.multiplier
  if (dto.isActive    !== undefined) updates.is_active  = dto.isActive

  if (Object.keys(updates).length === 0) return existing

  const { data, error } = await levelsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update service level', error)
  return data
}

export async function deleteLevel(id: string) {
  const { data: existing } = await levelsRepo.findById(id)
  if (!existing) throw AppError.notFound('Service level')

  const { error } = await levelsRepo.deleteById(id)
  if (error) throw AppError.internal('Failed to delete service level', error)
}
