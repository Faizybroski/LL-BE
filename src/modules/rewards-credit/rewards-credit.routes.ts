import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import * as controller from './rewards-credit.controller'

export const rewardsCreditRouter = Router()

rewardsCreditRouter.get('/summary', authMiddleware, controller.getMySummary)
rewardsCreditRouter.get('/history', authMiddleware, controller.getMyHistory)
