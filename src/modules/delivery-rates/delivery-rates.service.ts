import { AppError } from '../../lib/errors'
import * as ratesRepo from './delivery-rates.repository'
import type { CreateDeliveryRateDto, UpdateDeliveryRateDto } from './delivery-rates.schema'

export async function listRates() {
  const { data, error } = await ratesRepo.findAll()
  if (error) throw AppError.internal('Failed to fetch delivery rates', error)
  return data ?? []
}

export async function createRate(dto: CreateDeliveryRateDto) {
  const { data: existing } = await ratesRepo.findByServiceType(dto.serviceType)
  if (existing) throw AppError.badRequest(`A rate card for "${dto.serviceType}" already exists`)

  const { data, error } = await ratesRepo.insert({
    service_type:   dto.serviceType,
    label:          dto.label,
    base_fee:       dto.baseFee,
    per_km_rate:    dto.perKmRate,
    minimum_charge: dto.minimumCharge,
  })
  if (error || !data) throw AppError.internal('Failed to create delivery rate', error)
  return data
}

export async function updateRate(id: string, dto: UpdateDeliveryRateDto) {
  const { data: existing } = await ratesRepo.findById(id)
  if (!existing) throw AppError.notFound('Delivery rate')

  const updates: Record<string, unknown> = {}
  if (dto.label         !== undefined) updates.label          = dto.label
  if (dto.baseFee        !== undefined) updates.base_fee       = dto.baseFee
  if (dto.perKmRate      !== undefined) updates.per_km_rate    = dto.perKmRate
  if (dto.minimumCharge  !== undefined) updates.minimum_charge = dto.minimumCharge
  if (dto.isActive       !== undefined) updates.is_active      = dto.isActive

  if (Object.keys(updates).length === 0) return existing

  const { data, error } = await ratesRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update delivery rate', error)
  return data
}

export async function deleteRate(id: string) {
  const { data: existing } = await ratesRepo.findById(id)
  if (!existing) throw AppError.notFound('Delivery rate')

  const { error } = await ratesRepo.deleteById(id)
  if (error) throw AppError.internal('Failed to delete delivery rate', error)
}
