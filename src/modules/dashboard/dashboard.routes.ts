import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requirePermissionIfAdmin } from '../../middleware/role.middleware'
import * as dashboardController from './dashboard.controller'

export const dashboardRouter = Router()

// Shared with corporates (their own dashboard) — requirePermissionIfAdmin only
// enforces for role === 'admin', so corporates are unaffected.
dashboardRouter.get('/stats', authMiddleware, requirePermissionIfAdmin('reports.operational'), dashboardController.getStats)
