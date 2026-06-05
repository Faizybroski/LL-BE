import { AppError } from '../../lib/errors'
import * as locationsRepo from './locations.repository'
import type { CreateLocationDto, UpdateLocationDto, ListLocationsQuery } from './locations.schema'

export async function listLocations(query: ListLocationsQuery) {
  const { data, count, error } = await locationsRepo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch locations')
  return { locations: data ?? [], total: count ?? 0 }
}

export async function searchLocations(search: string) {
  const { data, error } = await locationsRepo.findByCity(search)
  if (error) throw AppError.internal('Failed to search locations')
  return data ?? []
}

export async function getLocation(id: string) {
  const { data, error } = await locationsRepo.findById(id)
  if (error || !data) throw AppError.notFound('Location')
  return data
}

export async function createLocation(dto: CreateLocationDto) {
  const { data: existing } = await locationsRepo.checkDuplicate(dto.city, dto.province)
  if (existing) {
    throw AppError.conflict(`'${dto.city}, ${dto.province}' already exists`)
  }

  const { data, error } = await locationsRepo.create({ city: dto.city, province: dto.province })
  if (error) throw AppError.internal('Failed to create location')
  return data
}

export async function updateLocation(id: string, dto: UpdateLocationDto) {
  const { data: existing } = await locationsRepo.findById(id)
  if (!existing) throw AppError.notFound('Location')

  const city     = dto.city     ?? existing.city
  const province = dto.province ?? existing.province

  if (dto.city !== undefined || dto.province !== undefined) {
    const { data: dup } = await locationsRepo.checkDuplicate(city, province, id)
    if (dup) throw AppError.conflict(`'${city}, ${province}' already exists`)
  }

  const updates: Record<string, unknown> = {}
  if (dto.city     !== undefined) updates.city     = dto.city
  if (dto.province !== undefined) updates.province = dto.province

  const { data, error } = await locationsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update location')
  return data
}

export async function deleteLocation(id: string) {
  const { data: existing } = await locationsRepo.findById(id)
  if (!existing) throw AppError.notFound('Location')

  const { count } = await locationsRepo.countUsage(id)
  if ((count ?? 0) > 0) {
    throw AppError.unprocessable(
      'This location is referenced by tracking events and cannot be deleted. Deactivate it instead.',
    )
  }

  const { error } = await locationsRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to delete location')
}
