import { Request, Response, NextFunction } from 'express'
import * as ratesService from './delivery-rates.service'
import { ok, created } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateDeliveryRateDto, UpdateDeliveryRateDto } from './delivery-rates.schema'

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await ratesService.listRates())
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rate = await ratesService.createRate(req.body as CreateDeliveryRateDto)
    created(res, rate, 'Delivery rate created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rate = await ratesService.updateRate(param(req, 'id'), req.body as UpdateDeliveryRateDto)
    ok(res, rate, 'Delivery rate updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ratesService.deleteRate(param(req, 'id'))
    ok(res, null, 'Delivery rate deleted')
  } catch (err) {
    next(err)
  }
}
