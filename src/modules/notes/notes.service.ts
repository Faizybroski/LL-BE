import { AppError } from '../../lib/errors'
import * as notesRepo from './notes.repository'
import type { CreateNoteDto, UpdateNoteDto, ListNotesQuery } from './notes.schema'

export async function listNotes(query: ListNotesQuery, callerRole: string) {
  if (query.entityType === 'shipper' && callerRole !== 'admin') {
    throw AppError.forbidden('Only administrators can view shipper notes')
  }
  const { data, count, error } = await notesRepo.findAll(query)
  if (error) {
    console.log(error)
    throw AppError.internal('Failed to fetch notes')}
  return { notes: data ?? [], total: count ?? 0 }
}

export async function createNote(dto: CreateNoteDto, createdBy: string, callerRole: string) {
  if (dto.entityType === 'shipper' && callerRole !== 'admin') {
    throw AppError.forbidden('Only administrators can create shipper notes')
  }
  const { data, error } = await notesRepo.create({
    entity_type: dto.entityType,
    entity_id: dto.entityId,
    content: dto.content,
    is_internal: dto.entityType === 'shipper' ? true : false,
    created_by: createdBy,
  })
  if (error) throw AppError.internal('Failed to create note')
  return data
}

export async function updateNote(id: string, dto: UpdateNoteDto, updatedBy: string, isAdmin: boolean) {
  if (!isAdmin) throw AppError.forbidden('Only administrators can edit notes')
  const { data, error } = await notesRepo.update(id, {
    content: dto.content,
    updated_by: updatedBy,
  })
  if (error) throw AppError.internal('Failed to update note')
  if (!data) throw AppError.notFound('Note')
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
