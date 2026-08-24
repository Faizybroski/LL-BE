import { Request, Response, NextFunction } from 'express'
import * as rewardsCreditService from './rewards-credit.service'
import { AppError } from '../../lib/errors'
import { ok } from '../../lib/response'

function requireResidential(req: Request): void {
  if (req.user!.role !== 'residential') {
    throw AppError.forbidden('Only residential customers have a Rewards Member balance')
  }
}

export async function getMySummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireResidential(req)
    const summary = await rewardsCreditService.getSummary(req.user!.id)
    ok(res, summary)
  } catch (err) {
    next(err)
  }
}

export async function getMyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireResidential(req)
    const history = await rewardsCreditService.getHistory(req.user!.id)
    ok(res, history)
  } catch (err) {
    next(err)
  }
}
