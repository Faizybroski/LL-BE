import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validate } from '../../lib/validate'
import { createNoteSchema, updateNoteSchema, listNotesQuerySchema } from './notes.schema'
import * as notesController from './notes.controller'

export const notesRouter = Router()

notesRouter.get('/', authMiddleware, validate(listNotesQuerySchema, 'query'), notesController.list)
notesRouter.post('/', authMiddleware, validate(createNoteSchema), notesController.create)
notesRouter.patch('/:id', authMiddleware, validate(updateNoteSchema), notesController.update)
notesRouter.delete('/:id', authMiddleware, notesController.remove)
