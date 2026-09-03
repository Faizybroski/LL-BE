import { Request, Response, NextFunction } from 'express'
import * as rewardsCreditService from './rewards-credit.service'
import * as rewardsCreditRepo from './rewards-credit.repository'
import { AppError } from '../../lib/errors'
import { ok } from '../../lib/response'
import { param } from '../../lib/params'

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

// ── Admin: view a residential customer's rewards ─────────────────────────────
async function assertResidentialTarget(profileId: string): Promise<void> {
  const { data } = await rewardsCreditRepo.findProfileRole(profileId)
  if (!data) throw AppError.notFound('Customer')
  if (data.role !== 'residential') {
    throw AppError.badRequest('This customer is not part of the residential Rewards program')
  }
}

export async function getCustomerSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profileId = param(req, 'profileId')
    await assertResidentialTarget(profileId)
    const summary = await rewardsCreditService.getSummary(profileId, { award: false })
    ok(res, summary)
  } catch (err) {
    next(err)
  }
}

export async function getCustomerHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profileId = param(req, 'profileId')
    await assertResidentialTarget(profileId)
    const history = await rewardsCreditService.getHistory(profileId, 100)
    ok(res, history)
  } catch (err) {
    next(err)
  }
}
