import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validate } from '../../lib/validate'
import { createNoteSchema, listNotesQuerySchema } from './notes.schema'
import * as notesController from './notes.controller'

export const notesRouter = Router()

notesRouter.get('/', authMiddleware, validate(listNotesQuerySchema, 'query'), notesController.list)
notesRouter.post('/', authMiddleware, validate(createNoteSchema), notesController.create)
notesRouter.delete('/:id', authMiddleware, notesController.remove)
