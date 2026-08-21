import { AppError } from '../../lib/errors'
import * as rewardsRepo from './rewards.repository'
import type { UpdateRewardsRuleDto } from './rewards.schema'

export async function listRewardsRules() {
  const { data, error } = await rewardsRepo.findAll()
  if (error) throw AppError.internal('Failed to fetch rewards rules', error)
  return data ?? []
}

export async function updateRewardsRule(id: string, dto: UpdateRewardsRuleDto) {
  const { data: existing } = await rewardsRepo.findById(id)
  if (!existing) throw AppError.notFound('Rewards rule')

  if (dto.value !== undefined && !existing.is_editable) {
    throw AppError.badRequest(`"${existing.title}" is not editable`)
  }

  const updates: Record<string, unknown> = {}
  if (dto.value !== undefined) updates.value = dto.value

  if (Object.keys(updates).length === 0) return existing

  const { data, error } = await rewardsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update rewards rule', error)

  return data
}
