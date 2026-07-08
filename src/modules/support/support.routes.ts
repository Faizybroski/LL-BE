import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
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

supportRouter.get('/',    authMiddleware, validate(listCasesQuerySchema, 'query'), ctrl.list)
supportRouter.post('/',   authMiddleware, validate(createCaseSchema), ctrl.create)
supportRouter.get('/:id', authMiddleware, ctrl.getOne)
supportRouter.patch('/:id',  authMiddleware, validate(updateCaseSchema), ctrl.update)
supportRouter.delete('/:id', authMiddleware, ctrl.remove)

supportRouter.patch('/:id/status', authMiddleware, validate(updateCaseStatusSchema), ctrl.updateStatus)

supportRouter.post('/:id/comments', authMiddleware, validate(createCommentSchema), ctrl.addComment)

supportRouter.post('/:id/attachments/upload-url', authMiddleware, validate(attachmentUploadUrlSchema), ctrl.attachmentUploadUrl)
supportRouter.post('/:id/attachments',             authMiddleware, validate(confirmAttachmentSchema), ctrl.confirmAttachment)
