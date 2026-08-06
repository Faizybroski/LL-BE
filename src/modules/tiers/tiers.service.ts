import { AppError } from '../../lib/errors'
import * as tiersRepo from './tiers.repository'
import type { UpdateTierDto } from './tiers.schema'

export interface TierWithCumulative {
  tier_id: string
  rank: number
  slug: string
  name: string
  min_deliveries: number
  benefits: string[]
  cumulativeBenefits: string[]
  quote_turnaround: string
  created_at: string
  updated_at: string
}

export async function listTiers(): Promise<TierWithCumulative[]> {
  const { data, error } = await tiersRepo.findAll()
  if (error) throw AppError.internal('Failed to fetch tiers', error)

  const tiers = data ?? []
  // Cumulative = this tier's own benefits plus every lower-ranked tier's own benefits.
  return tiers.map((tier) => ({
    ...tier,
    cumulativeBenefits: tiers
      .filter((t) => t.rank <= tier.rank)
      .flatMap((t) => t.benefits ?? []),
  }))
}

export async function updateTier(id: string, dto: UpdateTierDto) {
  const { data: existing } = await tiersRepo.findById(id)
  if (!existing) throw AppError.notFound('Tier')

  const updates: Record<string, unknown> = {}
  if (dto.min_deliveries   !== undefined) updates.min_deliveries   = dto.min_deliveries
  if (dto.benefits         !== undefined) updates.benefits         = dto.benefits
  if (dto.quote_turnaround !== undefined) updates.quote_turnaround = dto.quote_turnaround

  const { data, error } = await tiersRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update tier', error)

  return data
}
