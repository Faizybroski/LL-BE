import { Request, Response, NextFunction } from 'express'
import * as tiersService from './tiers.service'
import { ok } from '../../lib/response'
import { param } from '../../lib/params'
import type { UpdateTierDto } from './tiers.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tiers = await tiersService.listTiers()
    ok(res, tiers)
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tier = await tiersService.updateTier(param(req, 'id'), req.body as UpdateTierDto)
    ok(res, tier, 'Tier updated')
  } catch (err) {
    next(err)
  }
}
