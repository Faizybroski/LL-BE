import { Request, Response, NextFunction } from 'express'
import * as chargesService from './additional-charges.service'
import { ok, created } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateChargeDto, UpdateChargeDto } from './additional-charges.schema'

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await chargesService.listCharges())
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const charge = await chargesService.createCharge(req.body as CreateChargeDto)
    created(res, charge, 'Charge created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const charge = await chargesService.updateCharge(param(req, 'id'), req.body as UpdateChargeDto)
    ok(res, charge, 'Charge updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await chargesService.deleteCharge(param(req, 'id'))
    ok(res, null, 'Charge deleted')
  } catch (err) {
    next(err)
  }
}
