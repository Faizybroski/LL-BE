import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import * as dashboardController from './dashboard.controller'

export const dashboardRouter = Router()

dashboardRouter.get('/stats', authMiddleware, dashboardController.getStats)
