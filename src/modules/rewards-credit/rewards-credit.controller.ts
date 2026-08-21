import { Request, Response, NextFunction } from 'express'
import * as rewardsCreditService from './rewards-credit.service'
import { AppError } from '../../lib/errors'
import { ok } from '../../lib/response'

export async function getMyBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user!.role !== 'residential') {
      throw AppError.forbidden('Only residential customers have a Rewards Credit balance')
    }
    const balance = await rewardsCreditService.getBalance(req.user!.id)
    ok(res, { balance })
  } catch (err) {
    next(err)
  }
}
