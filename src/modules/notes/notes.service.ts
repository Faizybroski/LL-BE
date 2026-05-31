import { AppError } from '../../lib/errors'
import * as notesRepo from './notes.repository'
import type { CreateNoteDto, ListNotesQuery } from './notes.schema'

export async function listNotes(query: ListNotesQuery) {
  const { data, count, error } = await notesRepo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch notes')
  return { notes: data ?? [], total: count ?? 0 }
}

export async function createNote(dto: CreateNoteDto, createdBy: string) {
  const { data, error } = await notesRepo.create({
    entity_type: dto.entityType,
    entity_id: dto.entityId,
    content: dto.content,
    created_by: createdBy,
  })
  if (error) throw AppError.internal('Failed to create note')
  return data
}

export async function deleteNote(id: string, userId: string, isAdmin: boolean) {
  if (isAdmin) {
    const { error, count } = await notesRepo.deleteByIdAdmin(id)
    if (error) throw AppError.internal('Failed to delete note')
    if (!count) throw AppError.notFound('Note')
    return
  }

  const { error, count } = await notesRepo.deleteById(id, userId)
  if (error) throw AppError.internal('Failed to delete note')
  if (count === 0) throw AppError.forbidden('You can only delete your own notes')
}
