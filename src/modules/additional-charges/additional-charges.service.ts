import { AppError } from '../../lib/errors'
import * as chargesRepo from './additional-charges.repository'
import type { CreateChargeDto, UpdateChargeDto } from './additional-charges.schema'

export async function listCharges() {
  const { data, error } = await chargesRepo.findAll()
  if (error) throw AppError.internal('Failed to fetch additional charges', error)
  return data ?? []
}

export async function createCharge(dto: CreateChargeDto) {
  const { data: existing } = await chargesRepo.findByKey(dto.key)
  if (existing) throw AppError.badRequest(`A charge with key "${dto.key}" already exists`)

  const { data: all } = await chargesRepo.findAll()
  const nextSortOrder = (all?.length ?? 0) + 1

  const { data, error } = await chargesRepo.insert({
    key:        dto.key,
    category:   dto.category,
    label:      dto.label,
    amount:     dto.amount ?? null,
    unit:       dto.unit,
    purpose:    dto.purpose ?? null,
    sort_order: nextSortOrder,
  })
  if (error || !data) throw AppError.internal('Failed to create charge', error)
  return data
}

export async function updateCharge(id: string, dto: UpdateChargeDto) {
  const { data: existing } = await chargesRepo.findById(id)
  if (!existing) throw AppError.notFound('Charge')

  const updates: Record<string, unknown> = {}
  if (dto.label    !== undefined) updates.label     = dto.label
  if (dto.amount    !== undefined) updates.amount    = dto.amount
  if (dto.unit      !== undefined) updates.unit      = dto.unit
  if (dto.purpose   !== undefined) updates.purpose   = dto.purpose
  if (dto.isActive  !== undefined) updates.is_active = dto.isActive

  if (Object.keys(updates).length === 0) return existing

  const { data, error } = await chargesRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update charge', error)
  return data
}

export async function deleteCharge(id: string) {
  const { data: existing } = await chargesRepo.findById(id)
  if (!existing) throw AppError.notFound('Charge')

  const { error } = await chargesRepo.deleteById(id)
  if (error) throw AppError.internal('Failed to delete charge', error)
}
