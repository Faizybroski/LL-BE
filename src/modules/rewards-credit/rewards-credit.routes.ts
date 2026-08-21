import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import * as controller from './rewards-credit.controller'

export const rewardsCreditRouter = Router()

rewardsCreditRouter.get('/balance', authMiddleware, controller.getMyBalance)
