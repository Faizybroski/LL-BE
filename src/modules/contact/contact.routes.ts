import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  submitContactMessageSchema,
  updateContactMessageStatusSchema,
  listContactMessagesQuerySchema,
} from './contact.schema'
import * as ctrl from './contact.controller'

export const contactRouter = Router()

// Public — anonymous website visitors, no auth at all.
contactRouter.post('/', validate(submitContactMessageSchema), ctrl.submit)

// Admin inbox — reuse the existing support permission keys.
contactRouter.get('/',          authMiddleware, requirePermissionIfAdmin('support.view'),  validate(listContactMessagesQuerySchema, 'query'), ctrl.list)
contactRouter.patch('/:id/status', authMiddleware, requirePermissionIfAdmin('support.reply'), validate(updateContactMessageStatusSchema), ctrl.updateStatus)
