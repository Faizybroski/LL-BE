import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validate } from '../../lib/validate'
import { markReadSchema } from './notifications.schema'
import * as notificationsController from './notifications.controller'

export const notificationsRouter = Router()

notificationsRouter.get('/', authMiddleware, notificationsController.list)
notificationsRouter.patch('/read', authMiddleware, validate(markReadSchema), notificationsController.markRead)
notificationsRouter.patch('/read-all', authMiddleware, notificationsController.markAllRead)
