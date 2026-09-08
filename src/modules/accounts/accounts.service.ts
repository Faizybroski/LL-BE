import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as accountsRepo from './accounts.repository'
import * as authRepo from '../auth/auth.repository'
import * as notificationsService from '../notifications/notifications.service'
import { sendEmail } from '../../services/email/email.service'
import { approvalEmail, rejectionEmail } from '../../services/email/templates/account.templates'
import { REJECTION_REASON_META } from './rejection-reasons'
import {
  PORTAL_ACCESS_STATUSES,
  type CorporatePipelineStatus,
  type CreateAccountDto,
  type UpdateAccountDto,
  type RejectAccountDto,
  type ListAccountsQuery,
  type CreateAccountNoteDto,
  type UpdateAccountNoteDto,
  type UpdateOwnProfileDto,
  type UpdateCompanyLogoDto,
  type UpdateOwnCompanyDto,
} from './accounts.schema'
import type { NotificationType } from '../notifications/notifications.schema'

const REJECTION_RETENTION_DAYS = 90

// Both IDs shown on the profile pages are derived from the single
// `account_code` sequence number (e.g. "ACC-2026-027" -> 27): the request is
// "REQ-YYYY-NNNNN" while pending/rejected, the customer is "LLC-CORP-NNNNN"
// once approved. Format is presentational only — one source of truth.
function displayIds(row: Record<string, unknown>): { request_id: string; customer_id: string } {
  const code = (row.account_code as string | null) ?? ''
  const createdYear = new Date(row.created_at as string).getFullYear()
  const m = /(\d{4})-0*(\d+)\s*$/.exec(code) ?? /0*(\d+)\s*$/.exec(code)
  let year = createdYear
  let num = 0
  if (m) {
    if (m.length === 3) { year = Number(m[1]); num = Number(m[2]) }
    else { num = Number(m[1]) }
  }
  const padded = String(num).padStart(5, '0')
  return { request_id: `REQ-${year}-${padded}`, customer_id: `LLC-CORP-${padded}` }
}

function withDisplayIds<T extends Record<string, unknown>>(row: T): T & { request_id: string; customer_id: string } {
  return { ...row, ...displayIds(row) }
}

// "Shanika R. (CEO)" — actor label stored denormalized on each activity row.
async function actorLabel(userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, admin_role')
    .eq('id', userId)
    .maybeSingle()
  const name = (data?.full_name as string | null)?.trim() || 'Administrator'
  const roleRaw = data?.admin_role as string | null
  const role = roleRaw ? roleRaw.toUpperCase() : null
  return role ? `${name} (${role})` : name
}

export async function logAccountActivity(input: accountsRepo.ActivityInput): Promise<void> {
  try {
    await accountsRepo.insertActivity(input)
  } catch {
    /* activity logging must never block the operation it records */
  }
}

// Empty strings from the frontend (a cleared input) mean "clear this field".
function blankToNull(value: string | undefined): string | null | undefined {
  return value === '' ? null : value
}

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(userId: string, type: NotificationType, title: string, body: string, entityId: string): void {
  void notificationsService
    .createNotification({ userId, type, title, body, entityType: 'account', entityId })
    .catch(() => undefined)
}

// Fire-and-forget customer email for an account decision (approval / rejection).
// No provider is wired yet — email.service.ts logs only. Recipient is the
// account's contact email captured at sign-up.
function sendAccountEmail(
  account: Record<string, unknown>,
  build: (customerName: string) => { subject: string; html: string; text: string },
): void {
  const to = (account.contact_email as string | null)?.trim()
  if (!to) return
  const name =
    (account.contact_name as string | null)?.trim() ||
    (account.account_name as string | null)?.trim() ||
    ''
  const msg = build(name)
  void sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text }).catch(() => undefined)
}

async function findCompanyAdminId(accountId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('account_id', accountId)
    .eq('company_role', 'company_admin')
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

// Portal login access is derived from the pipeline stage — a company can sign in
// only while it's being onboarded or is active. Flips is_approved + is_active on
// every (non-deleted) login attached to the account.
export function portalAccessFor(status: CorporatePipelineStatus): boolean {
  return PORTAL_ACCESS_STATUSES.includes(status)
}

async function syncPortalAccess(accountId: string, status: CorporatePipelineStatus): Promise<void> {
  const allowed = portalAccessFor(status)
  await supabase
    .from('profiles')
    .update({ is_approved: allowed, is_active: allowed, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .is('deleted_at', null)

  // Moving OUT of a portal-access stage (suspend → inactive, deactivate → lost,
  // etc.) — kill live sessions so the block takes effect now, not on next
  // token refresh. Same treatment reject already gives.
  if (!allowed) {
    const { data: profiles } = await accountsRepo.findProfilesForAccount(accountId)
    for (const p of profiles ?? []) {
      await authRepo.revokeAllUserTokens(p.id as string).catch(() => undefined)
    }
  }
}

// ── Admin: Accounts ───────────────────────────────────────────────────────────
export async function listAccounts(query: ListAccountsQuery) {
  const { data, count, error } = await accountsRepo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch accounts', error)
  return { accounts: (data ?? []).map((r) => withDisplayIds(r as Record<string, unknown>)), total: count ?? 0 }
}

// Admin-only callers (routes are requireAdmin) — resolves rejected accounts too
// so the detail page, notes and the reconsider flow keep working after reject.
export async function getAccount(id: string, includeDeleted = true) {
  const { data, error } = await accountsRepo.findById(id, includeDeleted)
  if (error || !data) throw AppError.notFound('Account')
  return withDisplayIds(data as Record<string, unknown>)
}

export async function createAccount(dto: CreateAccountDto, createdBy: string) {
  const { data, error } = await accountsRepo.create({
    account_name:     dto.accountName,
    abn:              dto.abn,
    website:          dto.website,
    contact_name:     dto.contactName,
    contact_email:    dto.contactEmail,
    contact_phone:    dto.contactPhone,
    address_line1:    dto.addressLine1,
    address_city:     dto.addressCity,
    address_state:    dto.addressState,
    address_postcode: dto.addressPostcode,
    address_country:  dto.addressCountry,
    billing_email:          dto.billingEmail,
    accounts_payable_email: dto.accountsPayableEmail,
    billing_address:  dto.billingAddress,
    billing_city:     dto.billingCity,
    billing_state:    dto.billingState,
    billing_postcode: dto.billingPostcode,
    billing_country:  dto.billingCountry,
    credit_limit:     dto.creditLimit,
    payment_terms:    dto.paymentTerms,
    pipeline_status:  dto.pipelineStatus ?? 'prospect',
    created_by:       createdBy,
  })

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw AppError.conflict('An account with that name already exists')
    }
    throw AppError.internal('Failed to create account', error)
  }

  void logAccountActivity({
    accountId:  data.account_id as string,
    eventType:  'admin_added',
    description: `Corporate customer added at stage "${(dto.pipelineStatus ?? 'prospect')}"`,
    actorId:    createdBy,
    actorLabel: await actorLabel(createdBy),
    metadata:   { pipeline_status: dto.pipelineStatus ?? 'prospect' },
  })

  void notificationsService.notifyAllAdmins(
    'account_created',
    'New account created',
    `Account "${data.account_name as string}" was created.`,
    'account',
    data.account_id as string,
    createdBy,
  )

  return data
}

export async function updateAccount(id: string, dto: UpdateAccountDto, changedBy?: string) {
  const current = await getAccount(id)
  const prevStatus = current.pipeline_status as CorporatePipelineStatus
  const nextStatus = dto.pipelineStatus
  const statusChanged = nextStatus !== undefined && nextStatus !== prevStatus

  const updates: Record<string, unknown> = {}
  if (statusChanged) updates.pipeline_status = nextStatus
  if (dto.accountName     !== undefined) updates.account_name     = dto.accountName
  if (dto.abn             !== undefined) updates.abn              = dto.abn
  if (dto.website         !== undefined) updates.website          = dto.website
  if (dto.contactName     !== undefined) updates.contact_name     = dto.contactName
  if (dto.contactEmail    !== undefined) updates.contact_email    = dto.contactEmail
  if (dto.contactPhone    !== undefined) updates.contact_phone    = dto.contactPhone
  if (dto.addressLine1    !== undefined) updates.address_line1    = dto.addressLine1
  if (dto.addressCity     !== undefined) updates.address_city     = dto.addressCity
  if (dto.addressState    !== undefined) updates.address_state    = dto.addressState
  if (dto.addressPostcode !== undefined) updates.address_postcode = dto.addressPostcode
  if (dto.addressCountry  !== undefined) updates.address_country  = dto.addressCountry
  if (dto.billingEmail          !== undefined) updates.billing_email          = dto.billingEmail
  if (dto.accountsPayableEmail  !== undefined) updates.accounts_payable_email = dto.accountsPayableEmail
  if (dto.billingAddress  !== undefined) updates.billing_address  = dto.billingAddress
  if (dto.billingCity     !== undefined) updates.billing_city     = dto.billingCity
  if (dto.billingState    !== undefined) updates.billing_state    = dto.billingState
  if (dto.billingPostcode !== undefined) updates.billing_postcode = dto.billingPostcode
  if (dto.billingCountry  !== undefined) updates.billing_country  = dto.billingCountry
  if (dto.creditLimit     !== undefined) updates.credit_limit     = dto.creditLimit
  if (dto.paymentTerms    !== undefined) updates.payment_terms    = dto.paymentTerms
  if (dto.isActive        !== undefined) updates.is_active        = dto.isActive
  if (dto.businessType    !== undefined) updates.business_type    = dto.businessType
  if (dto.industry        !== undefined) updates.industry         = dto.industry

  if (Object.keys(updates).length === 0) return current

  const { data, error } = await accountsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update account', error)

  const accountName = data.account_name as string
  const actorName = changedBy ? await actorLabel(changedBy) : 'Administrator'

  // Pipeline stage change — derive portal access, log it distinctly, and tell
  // the company when their access flips.
  if (statusChanged && nextStatus) {
    await syncPortalAccess(id, nextStatus)
    void logAccountActivity({
      accountId: id,
      eventType: 'status_changed',
      description: `Pipeline status: ${prevStatus} → ${nextStatus}`,
      actorId: changedBy ?? null,
      actorLabel: actorName,
      metadata: { from: prevStatus, to: nextStatus },
    })
    const adminId = await findCompanyAdminId(id)
    if (adminId) {
      const gainedAccess = portalAccessFor(nextStatus)
      const lostAccess = portalAccessFor(prevStatus) && !gainedAccess
      if (gainedAccess) {
        notifyUser(adminId, 'account_updated', 'Your account is now active', `Your company account "${accountName}" is active — you can sign in to the portal.`, id)
        // Approval email — fires when the account reaches a portal-access stage
        // (onboarding / active) from a stage that did not grant access.
        sendAccountEmail(data as Record<string, unknown>, approvalEmail)
      } else if (lostAccess) {
        notifyUser(adminId, 'account_updated', 'Portal access paused', `Portal access for "${accountName}" was paused by an administrator.`, id)
      }
    }
  }

  const otherFields = Object.keys(updates).filter((k) => k !== 'pipeline_status')
  if (otherFields.length > 0) {
    void notificationsService.notifyAllAdmins('account_updated', 'Account updated', `Account "${accountName}" was updated.`, 'account', id)
    void logAccountActivity({
      accountId: id,
      eventType: 'account_updated',
      description: `Company details updated (${otherFields.length} field${otherFields.length === 1 ? '' : 's'})`,
      actorId: changedBy ?? null,
      actorLabel: actorName,
      metadata: { fields: otherFields },
    })
  }

  const companyAdminId = await findCompanyAdminId(id)
  if (companyAdminId && otherFields.length > 0) {
    notifyUser(companyAdminId, 'account_updated', 'Your account was updated', `Your company account "${accountName}" was updated by an administrator.`, id)
  }

  return data
}

export async function updateCompanyLogo(accountId: string, dto: UpdateCompanyLogoDto) {
  const { data, error } = await accountsRepo.updateById(accountId, {
    logo_url:   dto.logoUrl,
    updated_at: new Date().toISOString(),
  })
  if (error || !data) throw AppError.internal('Failed to update company logo', error)

  void notificationsService.notifyAllAdmins('account_updated', 'Company logo updated', `Logo for "${data.account_name as string}" was updated.`, 'account', accountId)

  return data
}

export async function deactivateAccount(id: string) {
  const account = await getAccount(id)
  const { error } = await accountsRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to deactivate account', error)

  // Also deactivate the company login(s) on this account — soft-deleting the
  // account row alone doesn't block login (auth.service checks profiles.is_active),
  // so without this a deactivated corporate customer could still sign in.
  await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('account_id', id)

  void notificationsService.notifyAllAdmins('account_updated', 'Account deactivated', `Account "${account.account_name as string}" was deactivated.`, 'account', id)
  const companyAdminId = await findCompanyAdminId(id)
  if (companyAdminId) {
    notifyUser(companyAdminId, 'account_updated', 'Your account was deactivated', 'Your company account was deactivated by an administrator.', id)
  }
}

// A corporate customer closing their own company account. Same soft-delete as
// the admin path above (account row + every login on it).
export async function deleteOwnAccount(userId: string) {
  const accountId = await getOwnAccountId(userId)
  await deactivateAccount(accountId)
}

// A corporate customer marking their own account as "lost" — they're leaving,
// but the record stays visible in the admin pipeline (reversible) rather than
// being hidden. Same effect an admin gets by moving the stage to 'lost'.
// Routes through updateAccount() so syncPortalAccess + activity log + admin
// notifications all fire.
export async function deactivateOwnAccount(userId: string) {
  const accountId = await getOwnAccountId(userId)
  await updateAccount(accountId, { pipelineStatus: 'lost' }, userId)
}

// ── Admin: Account Notes ──────────────────────────────────────────────────────
export async function listAccountNotes(accountId: string) {
  await getAccount(accountId)

  const { data, error } = await accountsRepo.findNotesByAccountId(accountId)
  if (error) throw AppError.internal('Failed to fetch notes', error)

  const notes = data ?? []

  if (notes.length === 0) return notes

  // Resolve author names — notes.created_by is a UUID referencing auth.users,
  // which mirrors profiles.id, but PostgREST can't traverse cross-schema FKs.
  const authorIds = [...new Set(notes.map((n) => n.created_by as string))]
  const { data: profiles } = await accountsRepo.findProfileNamesByIds(authorIds)

  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]),
  )

  return notes.map((note) => ({
    ...note,
    author: {
      id:       note.created_by,
      fullName: nameMap.get(note.created_by as string) ?? null,
    },
  }))
}

export async function createAccountNote(
  accountId: string,
  dto:       CreateAccountNoteDto,
  createdBy: string,
) {
  await getAccount(accountId)

  const { data, error } = await accountsRepo.createNote({
    accountId,
    content:    dto.content,
    isInternal: dto.isInternal,
    createdBy,
  })

  if (error || !data) throw AppError.internal('Failed to create note', error)

  void notificationsService.notifyAllAdmins('account_note_created', 'Account note added', 'A note was added to a corporate account.', 'account', accountId, createdBy)
  if (!dto.isInternal) {
    const companyAdminId = await findCompanyAdminId(accountId)
    if (companyAdminId) {
      notifyUser(companyAdminId, 'account_note_created', 'New note on your account', 'An administrator added a note to your company account.', accountId)
    }
  }

  return data
}

export async function updateAccountNote(
  accountId: string,
  noteId:    string,
  dto:       UpdateAccountNoteDto,
  updatedBy: string,
) {
  const { data: existing, error: findErr } = await accountsRepo.findNoteById(noteId, accountId)
  if (findErr || !existing) throw AppError.notFound('Note')

  const { data, error } = await accountsRepo.updateNoteById(noteId, dto.content, updatedBy)
  if (error || !data) throw AppError.internal('Failed to update note', error)

  void notificationsService.notifyAllAdmins('account_note_updated', 'Account note updated', 'A note on a corporate account was updated.', 'account', accountId, updatedBy)
  if (!existing.is_internal) {
    const companyAdminId = await findCompanyAdminId(accountId)
    if (companyAdminId) {
      notifyUser(companyAdminId, 'account_note_updated', 'Note on your account updated', 'An administrator updated a note on your company account.', accountId)
    }
  }

  return data
}

export async function deleteAccountNote(accountId: string, noteId: string) {
  const { data: existing, error: findErr } = await accountsRepo.findNoteById(noteId, accountId)
  if (findErr || !existing) throw AppError.notFound('Note')

  const { error } = await accountsRepo.softDeleteNoteById(noteId)
  if (error) throw AppError.internal('Failed to delete note', error)

  void notificationsService.notifyAllAdmins('account_note_updated', 'Account note deleted', 'A note on a corporate account was deleted.', 'account', accountId)
}

// ── Corporate: own account (company) ───────────────────────────────────────────
export async function getOwnProfile(userId: string) {
  const { data, error } = await accountsRepo.findAccountByUserId(userId)
  if (error || !data) throw AppError.notFound('Account')
  // The customer sees their own IDs / review status, but never the internal
  // review note or who rejected them.
  const { review_note, rejected_by, reviewed_by, ...safe } = data as Record<string, unknown>
  void review_note; void rejected_by; void reviewed_by
  return withDisplayIds(safe)
}

export async function updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
  const updates: Record<string, unknown> = {}
  if (dto.fullName !== undefined) updates.full_name = dto.fullName
  if (dto.phone    !== undefined) updates.phone     = dto.phone

  const { data, error } = await accountsRepo.updateProfileById(userId, updates)
  if (error || !data) throw AppError.internal('Failed to update profile', error)

  void notificationsService.notifyAllAdmins(
    'account_updated',
    'Corporate profile updated',
    `${(data.full_name as string | null) ?? 'A corporate'} updated their profile.`,
    'account',
    userId,
  )

  return data
}

// Company info/contacts self-service update — company_admin only, scoped to
// their own account. Commercial terms (credit limit, payment terms, isActive)
// are intentionally excluded and remain admin-managed.
export async function updateOwnCompany(userId: string, dto: UpdateOwnCompanyDto) {
  const accountId = await getOwnAccountId(userId)

  const updates: Record<string, unknown> = {}
  if (dto.accountName          !== undefined) updates.account_name           = dto.accountName
  if (dto.abn                  !== undefined) updates.abn                    = dto.abn
  if (dto.website               !== undefined) updates.website                = blankToNull(dto.website)
  if (dto.addressLine1          !== undefined) updates.address_line1          = dto.addressLine1
  if (dto.addressCity           !== undefined) updates.address_city           = dto.addressCity
  if (dto.addressState          !== undefined) updates.address_state          = dto.addressState
  if (dto.addressPostcode       !== undefined) updates.address_postcode       = dto.addressPostcode
  if (dto.addressCountry        !== undefined) updates.address_country        = dto.addressCountry
  if (dto.contactName           !== undefined) updates.contact_name           = dto.contactName
  if (dto.contactEmail          !== undefined) updates.contact_email          = blankToNull(dto.contactEmail)
  if (dto.contactPhone          !== undefined) updates.contact_phone          = dto.contactPhone
  if (dto.billingEmail          !== undefined) updates.billing_email          = blankToNull(dto.billingEmail)
  if (dto.accountsPayableEmail  !== undefined) updates.accounts_payable_email = blankToNull(dto.accountsPayableEmail)
  if (dto.businessType          !== undefined) updates.business_type          = blankToNull(dto.businessType)
  if (dto.industry              !== undefined) updates.industry               = blankToNull(dto.industry)

  const { data, error } = await accountsRepo.updateById(accountId, updates)
  if (error || !data) throw AppError.internal('Failed to update company profile', error)

  void notificationsService.notifyAllAdmins(
    'account_updated',
    'Corporate company profile updated',
    `Company "${data.account_name as string}" updated their own company profile.`,
    'account',
    accountId,
  )
  void logAccountActivity({
    accountId,
    eventType: 'account_updated',
    description: `Company details updated by the customer (${Object.keys(updates).length} field${Object.keys(updates).length === 1 ? '' : 's'})`,
    actorId: userId,
    actorLabel: await actorLabel(userId),
    metadata: { fields: Object.keys(updates) },
  })

  return data
}

// ── Company logo (company_admin only) ────────────────────────────────────────
export async function getOwnAccountId(userId: string): Promise<string> {
  const { data, error } = await accountsRepo.findProfileById(userId)
  if (error || !data || !data.account_id) throw AppError.notFound('Account')
  return data.account_id as string
}

// Returns a signed upload URL so the frontend can push directly to Supabase
// Storage without needing a Supabase Auth session (the app uses custom JWT).
export async function getLogoUploadUrl(accountId: string) {
  const path = `${accountId}/logo.webp`
  const { data, error } = await supabase.storage
    .from('company-logos')
    .createSignedUploadUrl(path)
  if (error || !data) throw AppError.internal('Failed to generate logo upload URL', error)

  const { data: pub } = supabase.storage.from('company-logos').getPublicUrl(path)
  return {
    signedUrl: data.signedUrl,
    token:     data.token,
    path:      data.path,
    publicUrl: pub.publicUrl,
  }
}

export async function removeLogo(accountId: string) {
  await supabase.storage.from('company-logos').remove([`${accountId}/logo.webp`])
  const { error } = await accountsRepo.updateById(accountId, {
    logo_url:   null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw AppError.internal('Failed to clear company logo', error)

  void notificationsService.notifyAllAdmins('account_updated', 'Company logo removed', 'A corporate removed their own company logo.', 'account', accountId)
}

// ── Admin: review lifecycle (reject / reconsider / purge) ────────────────────

// Reject a corporate account request: soft-delete + block login, keep a
// 90-day retention window (purge_after) after which migration 073's sweep
// hard-deletes everything. Reversible via reconsider() until then.
export async function rejectAccount(id: string, dto: RejectAccountDto, adminId: string) {
  const account = await getAccount(id, true)
  if (account.rejected_at) throw AppError.badRequest('This account request is already rejected')

  const now = new Date()
  const purgeAfter = new Date(now.getTime() + REJECTION_RETENTION_DAYS * 86_400_000)

  // Canned reason label + internal note. 'other' is the one reason where the
  // admin's typed note stands in for the canned text (schema requires it).
  const meta = REJECTION_REASON_META[dto.reason]
  const reviewNote = dto.reason === 'other' ? (dto.note ?? '').trim() : meta.internalNote

  const { data, error } = await accountsRepo.lifecycleUpdate(id, {
    rejected_at:      now.toISOString(),
    rejected_by:      adminId,
    rejection_reason: meta.label,
    review_note:      reviewNote,
    reviewed_at:      now.toISOString(),
    reviewed_by:      adminId,
    purge_after:      purgeAfter.toISOString(),
    deleted_at:       now.toISOString(),
    is_active:        false,
  })
  if (error || !data) throw AppError.internal('Failed to reject account', error)

  // Block portal access for every profile on the account.
  await accountsRepo.setProfilesApproval(id, false, false)
  const { data: profiles } = await accountsRepo.findProfilesForAccount(id)
  for (const p of profiles ?? []) {
    await authRepo.revokeAllUserTokens(p.id as string).catch(() => undefined)
  }

  const label = await actorLabel(adminId)
  await logAccountActivity({
    accountId: id, eventType: 'reviewed', description: 'Application reviewed',
    actorId: adminId, actorLabel: label,
  })
  await logAccountActivity({
    accountId: id, eventType: 'rejected',
    description: `Application rejected — ${meta.label}`,
    actorId: adminId, actorLabel: label,
    metadata: { reason: dto.reason, reasonLabel: meta.label, purgeAfter: purgeAfter.toISOString() },
  })

  void notificationsService.notifyAllAdmins(
    'account_updated', 'Corporate request rejected',
    `"${account.account_name}" was rejected. Data purges on ${purgeAfter.toISOString().slice(0, 10)}.`,
    'account', id, adminId,
  )

  // Rejection email to the applicant — canned body per the chosen reason.
  sendAccountEmail(account as Record<string, unknown>, (name) => rejectionEmail(meta.emailBody, name))

  return withDisplayIds(data as Record<string, unknown>)
}

// Undo a rejection while still inside the retention window.
export async function reconsiderAccount(id: string, adminId: string) {
  const account = await getAccount(id, true)
  if (!account.rejected_at) throw AppError.badRequest('This account is not rejected')
  if (account.purge_after && new Date(account.purge_after as string).getTime() < Date.now()) {
    throw AppError.badRequest('The retention window has closed — this account can no longer be restored')
  }

  const { data, error } = await accountsRepo.lifecycleUpdate(id, {
    rejected_at:      null,
    rejected_by:      null,
    rejection_reason: null,
    review_note:      null,
    reviewed_at:      null,
    reviewed_by:      null,
    purge_after:      null,
    deleted_at:       null,
    is_active:        true,
  })
  if (error || !data) throw AppError.internal('Failed to reconsider account', error)

  // Re-enable profiles but keep them PENDING (is_approved = false) — reconsider
  // returns the request to the review queue, it does not approve it.
  await accountsRepo.setProfilesApproval(id, false, true)

  const label = await actorLabel(adminId)
  await logAccountActivity({
    accountId: id, eventType: 'reconsidered',
    description: 'Rejection withdrawn — request reopened for review',
    actorId: adminId, actorLabel: label,
  })

  void notificationsService.notifyAllAdmins(
    'account_updated', 'Corporate request reopened',
    `"${account.account_name}" was moved back to pending review.`,
    'account', id, adminId,
  )

  return withDisplayIds(data as Record<string, unknown>)
}

// Skip the retention window and hard-delete now. Irreversible.
export async function purgeAccount(id: string, adminId: string) {
  const account = await getAccount(id, true)
  if (!account.rejected_at) {
    throw AppError.badRequest('Only a rejected account can be purged')
  }
  const { error } = await accountsRepo.purgeAccountRpc(id)
  if (error) throw AppError.internal('Failed to purge account', error)

  void notificationsService.notifyAllAdmins(
    'account_updated', 'Corporate account purged',
    `"${account.account_name}" and all linked data were permanently deleted.`,
    'account', id, adminId,
  )
}

// ── Stats + activity (shared by admin detail and corporate own-company page) ──
export async function getAccountStats(accountId: string) {
  const { data: profiles } = await accountsRepo.findProfilesForAccount(accountId)
  const profileIds = (profiles ?? []).map((p) => p.id as string)

  const [totalRes, activeRes, deliveredRes, quotesRes, paidRes] = await Promise.all([
    accountsRepo.countShipments(accountId, 'all'),
    accountsRepo.countShipments(accountId, 'active'),
    accountsRepo.countShipments(accountId, 'delivered'),
    accountsRepo.countOpenQuotes(profileIds),
    accountsRepo.sumPaidInvoices(profileIds),
  ])

  const totalSpend = (paidRes.data ?? []).reduce(
    (sum, r) => sum + Number((r as { total: number }).total ?? 0), 0,
  )

  return {
    totalShipments:     totalRes.count ?? 0,
    activeShipments:    activeRes.count ?? 0,
    deliveredShipments: deliveredRes.count ?? 0,
    openQuotes:         quotesRes.count ?? 0,
    totalSpend,
  }
}

export async function getAccountActivity(accountId: string, includeInternal: boolean) {
  const { data, error } = await accountsRepo.listActivity(accountId, { includeInternal })
  if (error) throw AppError.internal('Failed to fetch activity', error)
  return data ?? []
}

// Corporate self-service equivalents — scoped to the caller's own account.
export async function getOwnAccountStats(userId: string) {
  const accountId = await getOwnAccountId(userId)
  return getAccountStats(accountId)
}

export async function getOwnAccountActivity(userId: string) {
  const accountId = await getOwnAccountId(userId)
  return getAccountActivity(accountId, false)
}
