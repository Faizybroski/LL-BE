import crypto from 'crypto'
import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as repo from './support.repository'
import * as notificationsService from '../notifications/notifications.service'
import type {
  CreateCaseDto,
  UpdateCaseStatusDto,
  UpdateCaseDto,
  CreateCommentDto,
  ListCasesQuery,
  AttachmentUploadUrlDto,
  ConfirmAttachmentDto,
} from './support.schema'

const OPEN_STATUSES = new Set(['open', 'in_progress'])

const BUCKET = 'support-attachments'

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(
  userId: string,
  type: 'support_case_replied' | 'support_case_status_changed',
  title: string,
  body: string,
  entityId: string,
): void {
  void notificationsService
    .createNotification({ userId, type, title, body, entityType: 'support_case', entityId })
    .catch(() => undefined)
}

async function resolveAuthors<T extends { [key: string]: unknown }>(
  rows: T[],
  idKey: keyof T,
): Promise<(T & { author: { id: string; fullName: string | null; avatarUrl: string | null } | null })[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map((r) => r[idKey] as string).filter(Boolean))]
  const { data: profiles } = await repo.findProfileNamesByIds(ids)
  const map = new Map((profiles ?? []).map((p) => [p.id as string, p]))
  return rows.map((r) => {
    const p = map.get(r[idKey] as string)
    return {
      ...r,
      author: p
        ? { id: p.id as string, fullName: p.full_name as string | null, avatarUrl: p.avatar_url as string | null }
        : null,
    }
  })
}

// ── Scoping ────────────────────────────────────────────────────────────────────
// Shippers can only create, edit, and track their OWN tickets — not their
// company's. Admin has unrestricted access (complete management).
function assertCanAccessCase(
  caseRow: { created_by: string },
  callerRole: string,
  callerId: string,
): void {
  if (callerRole === 'admin') return
  if (caseRow.created_by === callerId) return
  throw AppError.forbidden('You do not have access to this support case')
}

// ── Cases ─────────────────────────────────────────────────────────────────────

export async function listCases(
  query: ListCasesQuery,
  callerRole: string,
  callerId: string,
) {
  const createdBy = callerRole === 'shipper' ? callerId : undefined
  const { data, count, error } = await repo.findAll(query, createdBy)
  if (error) throw AppError.internal('Failed to fetch support cases')

  // Admin manages cases system-wide — surface who raised each one so cases
  // aren't indistinguishable in the table. Shippers only ever see their own
  // cases, so the requester is redundant for them.
  const cases = callerRole === 'admin'
    ? await resolveAuthors(data ?? [], 'created_by')
    : (data ?? [])

  return { cases, total: count ?? 0 }
}

export async function getCase(
  id: string,
  callerRole: string,
  callerId: string,
) {
  const { data: caseRow, error } = await repo.findById(id)
  if (error || !caseRow) throw AppError.notFound('Support case')

  assertCanAccessCase(caseRow, callerRole, callerId)

  const [{ data: comments }, { data: attachments }, { data: events }] = await Promise.all([
    repo.findCommentsByCaseId(id),
    repo.findAttachmentsByCaseId(id),
    repo.findEventsByCaseId(id),
  ])

  const [commentsWithAuthors, eventsWithAuthors] = await Promise.all([
    resolveAuthors(comments ?? [], 'author_id'),
    resolveAuthors(events ?? [], 'created_by'),
  ])

  const attachmentsWithUrls = await Promise.all(
    (attachments ?? []).map(async (a) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(a.file_path as string, 60 * 60) // 1 hour
      return { ...a, url: signed?.signedUrl ?? null }
    }),
  )

  return {
    ...caseRow,
    comments: commentsWithAuthors,
    attachments: attachmentsWithUrls,
    events: eventsWithAuthors,
  }
}

export async function createCase(dto: CreateCaseDto, createdBy: string, callerRole: string) {
  const accountId = callerRole === 'shipper' ? await repo.findAccountIdByUserId(createdBy) : null

  const { data: caseRow, error } = await repo.create({
    account_id:  accountId,
    created_by:  createdBy,
    subject:     dto.subject,
    description: dto.description,
  })
  if (error || !caseRow) throw AppError.internal('Failed to create support case')

  await repo.createEvent({ case_id: caseRow.case_id, event_type: 'created', created_by: createdBy })

  return caseRow
}

export async function updateCaseStatus(
  id: string,
  dto: UpdateCaseStatusDto,
  callerRole: string,
) {
  if (callerRole !== 'admin') throw AppError.forbidden('Only support staff can change case status')

  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Support case')
  if (existing.status === dto.status) return existing

  const { data: updated, error } = await repo.updateStatus(id, dto.status)
  if (error || !updated) throw AppError.internal('Failed to update case status')

  await repo.createEvent({
    case_id:     id,
    event_type:  'status_changed',
    from_status: existing.status,
    to_status:   dto.status,
  })

  notifyUser(
    existing.created_by as string,
    'support_case_status_changed',
    'Support case updated',
    `Case ${existing.case_number} is now "${dto.status.replace('_', ' ')}".`,
    id,
  )

  return updated
}

// Shipper: only the creator, and only while the case is still open/in progress.
// Admin: complete management — can edit any case regardless of status.
export async function updateCase(
  id: string,
  dto: UpdateCaseDto,
  callerId: string,
  callerRole: string,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Support case')
  assertCanAccessCase(existing, callerRole, callerId)

  if (callerRole !== 'admin' && !OPEN_STATUSES.has(existing.status)) {
    throw AppError.forbidden('This case can no longer be edited')
  }

  const patch: Record<string, unknown> = {}
  if (dto.subject     !== undefined) patch.subject     = dto.subject
  if (dto.description !== undefined) patch.description = dto.description

  const { data: updated, error } = await repo.update(id, patch)
  if (error || !updated) throw AppError.internal('Failed to update support case')
  return updated
}

// Admin-only — complete management includes removing cases entirely.
export async function deleteCase(id: string, callerRole: string) {
  if (callerRole !== 'admin') throw AppError.forbidden('Only support staff can delete cases')

  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Support case')

  const { error } = await repo.softDelete(id)
  if (error) throw AppError.internal('Failed to delete support case')
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function addComment(
  id: string,
  dto: CreateCommentDto,
  callerId: string,
  callerRole: string,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Support case')
  assertCanAccessCase(existing, callerRole, callerId)

  const { data, error } = await repo.createComment({ case_id: id, author_id: callerId, content: dto.content })
  if (error || !data) throw AppError.internal('Failed to add comment')

  // Notify the customer when support staff replies (no equivalent single recipient for the reverse).
  if (callerRole === 'admin' && existing.created_by !== callerId) {
    notifyUser(
      existing.created_by as string,
      'support_case_replied',
      'New reply on your support case',
      `Support replied on case ${existing.case_number}.`,
      id,
    )
  }

  return data
}

// ── Attachments ───────────────────────────────────────────────────────────────

export async function getAttachmentUploadUrl(
  id: string,
  dto: AttachmentUploadUrlDto,
  callerId: string,
  callerRole: string,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Support case')
  assertCanAccessCase(existing, callerRole, callerId)

  const safeName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${id}/${crypto.randomUUID()}-${safeName}`

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw AppError.internal('Failed to generate upload URL')

  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function confirmAttachment(
  id: string,
  dto: ConfirmAttachmentDto,
  callerId: string,
  callerRole: string,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Support case')
  assertCanAccessCase(existing, callerRole, callerId)

  const { data, error } = await repo.createAttachment({
    case_id:     id,
    uploaded_by: callerId,
    file_name:   dto.fileName,
    file_path:   dto.filePath,
    ...(dto.fileSize !== undefined && { file_size: dto.fileSize }),
  })
  if (error || !data) throw AppError.internal('Failed to record attachment')

  await repo.createEvent({
    case_id:    id,
    event_type: 'attachment_added',
    note:       dto.fileName,
    created_by: callerId,
  })

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(dto.filePath, 60 * 60)
  return { ...data, url: signed?.signedUrl ?? null }
}
