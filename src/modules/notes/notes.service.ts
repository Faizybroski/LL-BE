import { AppError } from '../../lib/errors'
import * as notesRepo from './notes.repository'
import * as notificationsService from '../notifications/notifications.service'
import type { CreateNoteDto, UpdateNoteDto, ListNotesQuery } from './notes.schema'

export async function listNotes(query: ListNotesQuery, callerRole: string) {
  if ((query.entityType === 'corporate' || query.entityType === 'account') && callerRole !== 'admin') {
    throw AppError.forbidden('Only administrators can view company notes')
  }
  const { data, count, error } = await notesRepo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch notes', error)
  return { notes: data ?? [], total: count ?? 0 }
}

export async function createNote(dto: CreateNoteDto, createdBy: string, callerRole: string) {
  if ((dto.entityType === 'corporate' || dto.entityType === 'account') && callerRole !== 'admin') {
    throw AppError.forbidden('Only administrators can create company notes')
  }
  const { data, error } = await notesRepo.create({
    entity_type: dto.entityType,
    entity_id: dto.entityId,
    content: dto.content,
    is_internal: (dto.entityType === 'corporate' || dto.entityType === 'account') ? true : false,
    created_by: createdBy,
  })
  if (error) throw AppError.internal('Failed to create note', error)

  void notificationsService.notifyAllAdmins(
    'note_created',
    'New note added',
    `A note was added to a ${dto.entityType}.`,
    dto.entityType,
    dto.entityId,
    createdBy,
  )

  return data
}

export async function updateNote(
  id: string,
  dto: UpdateNoteDto,
  updatedBy: string,
  isAdmin: boolean,
) {
  if (!isAdmin) throw AppError.forbidden('Only administrators can edit notes')
  const { data, error } = await notesRepo.update(id, {
    content: dto.content,
    updated_by: updatedBy,
  })
  if (error) throw AppError.internal('Failed to update note', error)
  if (!data) throw AppError.notFound('Note')

  void notificationsService.notifyAllAdmins(
    'note_updated',
    'Note updated',
    `A note on a ${data.entity_type as string} was updated.`,
    data.entity_type as string,
    data.entity_id as string,
    updatedBy,
  )

  return data
}

export async function deleteNote(id: string, userId: string, isAdmin: boolean) {
  if (isAdmin) {
    const { error, count } = await notesRepo.deleteByIdAdmin(id)
    if (error) throw AppError.internal('Failed to delete note', error)
    if (!count) throw AppError.notFound('Note')
    void notificationsService.notifyAllAdmins('note_deleted', 'Note deleted', 'A note was deleted.', 'note', id, userId)
    return
  }

  const { error, count } = await notesRepo.deleteById(id, userId)
  if (error) throw AppError.internal('Failed to delete note', error)
  if (count === 0) throw AppError.forbidden('You can only delete your own notes')
  void notificationsService.notifyAllAdmins('note_deleted', 'Note deleted', 'A note was deleted.', 'note', id, userId)
}
