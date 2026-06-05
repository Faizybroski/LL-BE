import { Request, Response, NextFunction } from 'express'
import * as dashboardService from './dashboard.service'
import { ok } from '../../lib/response'

export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.role === 'admin'
    const stats = await dashboardService.getDashboardStats(
      isAdmin,
      req.user!.accountId,
      req.user!.id,
      req.user!.companyRole,
    )
    ok(res, stats)
  } catch (err) {
    next(err)
  }
}
