import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requirePermissionIfAdmin } from '../../middleware/role.middleware'
import { validate } from '../../lib/validate'
import {
  createCaseSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
  createCommentSchema,
  listCasesQuerySchema,
  attachmentUploadUrlSchema,
  confirmAttachmentSchema,
} from './support.schema'
import * as ctrl from './support.controller'

export const supportRouter = Router()

// requirePermissionIfAdmin no-ops for corporate/residential case owners — only
// admin staff without the matching permission get blocked.
supportRouter.get('/',    authMiddleware, requirePermissionIfAdmin('support.view'), validate(listCasesQuerySchema, 'query'), ctrl.list)
supportRouter.post('/',   authMiddleware, requirePermissionIfAdmin('support.create'), validate(createCaseSchema), ctrl.create)
supportRouter.get('/:id', authMiddleware, requirePermissionIfAdmin('support.view'), ctrl.getOne)
supportRouter.patch('/:id',  authMiddleware, requirePermissionIfAdmin('support.reply'), validate(updateCaseSchema), ctrl.update)
supportRouter.delete('/:id', authMiddleware, requirePermissionIfAdmin('support.close'), ctrl.remove)

supportRouter.patch('/:id/status', authMiddleware, requirePermissionIfAdmin('support.close'), validate(updateCaseStatusSchema), ctrl.updateStatus)

supportRouter.post('/:id/comments', authMiddleware, requirePermissionIfAdmin('support.reply'), validate(createCommentSchema), ctrl.addComment)

supportRouter.post('/:id/attachments/upload-url', authMiddleware, requirePermissionIfAdmin('support.reply'), validate(attachmentUploadUrlSchema), ctrl.attachmentUploadUrl)
supportRouter.post('/:id/attachments',             authMiddleware, requirePermissionIfAdmin('support.reply'), validate(confirmAttachmentSchema), ctrl.confirmAttachment)
