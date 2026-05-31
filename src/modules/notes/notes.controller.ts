import { Request, Response, NextFunction } from 'express'
import * as notesService from './notes.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateNoteDto, ListNotesQuery } from './notes.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { notes, total } = await notesService.listNotes(req.query as unknown as ListNotesQuery)
    paginated(res, notes, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const note = await notesService.createNote(req.body as CreateNoteDto, req.user!.id)
    created(res, note, 'Note added')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await notesService.deleteNote(param(req, 'id'), req.user!.id, req.user!.role === 'admin')
    noContent(res)
  } catch (err) {
    next(err)
  }
}
