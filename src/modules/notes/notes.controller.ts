import { Request, Response, NextFunction } from 'express'
import * as notesService from './notes.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateNoteDto, UpdateNoteDto, ListNotesQuery } from './notes.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { notes, total } = await notesService.listNotes(
      req.query as unknown as ListNotesQuery,
      req.user!.role,
    )
    paginated(res, notes, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const note = await notesService.createNote(
      req.body as CreateNoteDto,
      req.user!.id,
      req.user!.role,
    )
    created(res, note, 'Note added')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const note = await notesService.updateNote(
      param(req, 'id'),
      req.body as UpdateNoteDto,
      req.user!.id,
      req.user!.role === 'admin',
    )
    ok(res, note, 'Note updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const note = await notesService.deleteNote(
      param(req, 'id'),
      req.user!.id,
      req.user!.role === 'admin',
    )
    ok(res, note, 'Note deleted')
  } catch (err) {
    next(err)
  }
}
