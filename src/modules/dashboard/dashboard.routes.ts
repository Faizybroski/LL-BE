import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requirePermissionIfAdmin } from '../../middleware/role.middleware'
import * as dashboardController from './dashboard.controller'

export const dashboardRouter = Router()

// Shared with shippers (their own dashboard) — requirePermissionIfAdmin only
// enforces for role === 'admin', so shippers are unaffected.
dashboardRouter.get('/stats', authMiddleware, requirePermissionIfAdmin('reports.operational'), dashboardController.getStats)
