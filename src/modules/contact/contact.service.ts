import { AppError } from '../../lib/errors'
import * as repo from './contact.repository'
import * as notificationsService from '../notifications/notifications.service'
import type {
  SubmitContactMessageDto,
  UpdateContactMessageStatusDto,
  ListContactMessagesQuery,
} from './contact.schema'

export async function submitContactMessage(dto: SubmitContactMessageDto) {
  const { data: row, error } = await repo.insertMessage({
    name:    dto.name,
    email:   dto.email,
    ...(dto.phone && { phone: dto.phone }),
    subject: dto.subject,
    message: dto.message,
  })
  if (error || !row) throw AppError.internal('Failed to submit contact message', error)

  // Fire-and-forget — notifications must never block the caller's submission.
  void notificationsService
    .notifyAllAdmins(
      'system',
      'New contact message',
      `${dto.name} sent a message: "${dto.subject}".`,
      'contact_message',
      row.id as string,
    )
    .catch(() => undefined)

  return row
}

export async function listContactMessages(query: ListContactMessagesQuery) {
  const { data, count, error } = await repo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch contact messages', error)
  return { messages: data ?? [], total: count ?? 0 }
}

export async function updateContactMessageStatus(id: string, dto: UpdateContactMessageStatusDto) {
  const { data: existing, error: findErr } = await repo.findById(id)
  if (findErr || !existing) throw AppError.notFound('Contact message')

  const { data: updated, error } = await repo.updateStatus(id, dto.status)
  if (error || !updated) throw AppError.internal('Failed to update contact message status', error)

  return updated
}
