import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import * as ctrl from './legal.controller'

export const legalRouter = Router()

legalRouter.get('/terms.pdf', authMiddleware, ctrl.termsPdf)
