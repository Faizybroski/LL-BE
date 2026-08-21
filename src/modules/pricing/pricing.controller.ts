import { Request, Response, NextFunction } from 'express'
import * as pricingService from './pricing.service'
import { ok } from '../../lib/response'
import type { CalculatePriceDto, UpdateWeightRateDto } from './pricing.schema'

export async function calculate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const breakdown = await pricingService.calculateDeliveryPrice(req.body as CalculatePriceDto)
    ok(res, breakdown)
  } catch (err) {
    next(err)
  }
}

export async function getWeightRate(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await pricingService.getWeightRate())
  } catch (err) {
    next(err)
  }
}

export async function updateWeightRate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateWeightRateDto
    ok(res, await pricingService.updateWeightRate(dto.value), 'Weight pricing rate updated')
  } catch (err) {
    next(err)
  }
}
