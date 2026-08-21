import { Request, Response, NextFunction } from 'express'
import * as rewardsService from './rewards.service'
import { ok } from '../../lib/response'
import { param } from '../../lib/params'
import type { UpdateRewardsRuleDto } from './rewards.schema'

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rules = await rewardsService.listRewardsRules()
    ok(res, rules)
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rule = await rewardsService.updateRewardsRule(param(req, 'id'), req.body as UpdateRewardsRuleDto)
    ok(res, rule, 'Rewards rule updated')
  } catch (err) {
    next(err)
  }
}
