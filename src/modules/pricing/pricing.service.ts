import { AppError } from '../../lib/errors'
import * as ratesRepo from '../delivery-rates/delivery-rates.repository'
import * as chargesRepo from '../additional-charges/additional-charges.repository'
import * as levelsRepo from '../service-levels/service-levels.repository'
import * as pricingRepo from './pricing.repository'
import type { CalculatePriceDto } from './pricing.schema'

export interface PriceBreakdown {
  serviceType:      string
  label:            string
  baseFee:          number
  distanceKm:       number
  perKmRate:        number
  distanceCharge:   number
  minimumCharge:    number
  serviceLevel:      string
  serviceLevelLabel: string
  serviceLevelMultiplier: number
  deliveryCharge:   number // max(baseFee + distanceCharge, minimumCharge) × serviceLevelMultiplier
  weightKg:         number
  weightPerKgRate:  number
  weightCharge:     number
  additionalCharges: { key: string; label: string; amount: number }[]
  additionalChargesTotal: number
  subtotal:         number // deliveryCharge + weightCharge + additionalChargesTotal
}

// Shared calculation used two ways (Aug 3 PDF): triggered manually by an admin
// via the Pricing Calculator drawer for corporate requests, or called directly
// (no HTTP round trip) from the residential self-service quote-request flow.
export async function calculateDeliveryPrice(dto: CalculatePriceDto): Promise<PriceBreakdown> {
  const { data: rate, error: rateErr } = await ratesRepo.findByServiceType(dto.serviceType)
  if (rateErr || !rate) throw AppError.notFound('Delivery rate card')
  if (!rate.is_active) throw AppError.badRequest(`The "${rate.label}" rate card is not currently active`)

  const { data: level, error: levelErr } = await levelsRepo.findBySlug(dto.serviceLevel)
  if (levelErr || !level) throw AppError.notFound('Service level')
  if (!level.is_active) throw AppError.badRequest(`The "${level.label}" service level is not currently active`)

  const distanceCharge = dto.distanceKm * rate.per_km_rate
  const rawCharge = rate.base_fee + distanceCharge
  const deliveryCharge = Math.round(Math.max(rawCharge, rate.minimum_charge) * level.multiplier * 100) / 100

  const weightKg = dto.weightKg ?? 0
  let weightPerKgRate = 0
  let weightCharge = 0
  if (weightKg > 0) {
    const { data: weightRate, error: weightErr } = await pricingRepo.getWeightRate()
    if (weightErr) throw AppError.internal('Failed to fetch weight pricing rate', weightErr)
    weightPerKgRate = weightRate?.value ?? 0
    weightCharge = Math.round(weightKg * weightPerKgRate * 100) / 100
  }

  const additionalCharges: { key: string; label: string; amount: number }[] = []
  if (dto.additionalChargeKeys.length > 0) {
    const { data: allCharges, error: chargesErr } = await chargesRepo.findAll()
    if (chargesErr) throw AppError.internal('Failed to fetch additional charges', chargesErr)

    for (const key of dto.additionalChargeKeys) {
      const charge = (allCharges ?? []).find((c) => c.key === key)
      if (!charge) throw AppError.badRequest(`Unknown additional charge "${key}"`)
      if (!charge.is_active) throw AppError.badRequest(`"${charge.label}" is not currently active`)
      if (charge.amount == null) {
        throw AppError.badRequest(`"${charge.label}" is admin-controlled and has no default amount — set one before applying it`)
      }
      additionalCharges.push({ key: charge.key, label: charge.label, amount: charge.amount })
    }
  }

  const additionalChargesTotal = additionalCharges.reduce((sum, c) => sum + c.amount, 0)

  return {
    serviceType:    rate.service_type,
    label:          rate.label,
    baseFee:        rate.base_fee,
    distanceKm:     dto.distanceKm,
    perKmRate:      rate.per_km_rate,
    distanceCharge,
    minimumCharge:  rate.minimum_charge,
    serviceLevel:           level.slug,
    serviceLevelLabel:      level.label,
    serviceLevelMultiplier: level.multiplier,
    deliveryCharge,
    weightKg,
    weightPerKgRate,
    weightCharge,
    additionalCharges,
    additionalChargesTotal,
    subtotal: Math.round((deliveryCharge + weightCharge + additionalChargesTotal) * 100) / 100,
  }
}

export async function getWeightRate() {
  const { data, error } = await pricingRepo.getWeightRate()
  if (error) throw AppError.internal('Failed to fetch weight pricing rate', error)
  if (!data) throw AppError.notFound('Weight pricing rate')
  return data
}

export async function updateWeightRate(value: number) {
  const { data, error } = await pricingRepo.updateWeightRate(value)
  if (error || !data) throw AppError.internal('Failed to update weight pricing rate', error)
  return data
}
