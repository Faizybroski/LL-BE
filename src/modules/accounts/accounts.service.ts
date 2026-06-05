import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as accountsRepo from './accounts.repository'
import type {
  CreateAccountDto,
  UpdateAccountDto,
  ListAccountsQuery,
  CreateAccountNoteDto,
  UpdateAccountNoteDto,
  UpdateOwnProfileDto,
  UpdateCompanyLogoDto,
} from './accounts.schema'

// ── Admin: Accounts ───────────────────────────────────────────────────────────
export async function listAccounts(query: ListAccountsQuery) {
  const { data, count, error } = await accountsRepo.findAll(query)
  if (error) throw AppError.internal('Failed to fetch accounts')
  return { accounts: data ?? [], total: count ?? 0 }
}

export async function getAccount(id: string) {
  const { data, error } = await accountsRepo.findById(id)
  if (error || !data) throw AppError.notFound('Account')
  return data
}

export async function createAccount(dto: CreateAccountDto, createdBy: string) {
  const { data, error } = await accountsRepo.create({
    account_name:     dto.accountName,
    abn:              dto.abn,
    contact_name:     dto.contactName,
    contact_email:    dto.contactEmail,
    contact_phone:    dto.contactPhone,
    billing_address:  dto.billingAddress,
    billing_city:     dto.billingCity,
    billing_state:    dto.billingState,
    billing_postcode: dto.billingPostcode,
    billing_country:  dto.billingCountry,
    credit_limit:     dto.creditLimit,
    payment_terms:    dto.paymentTerms,
    created_by:       createdBy,
  })

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw AppError.conflict('An account with that name already exists')
    }
    throw AppError.internal('Failed to create account')
  }

  return data
}

export async function updateAccount(id: string, dto: UpdateAccountDto) {
  await getAccount(id)

  const updates: Record<string, unknown> = {}
  if (dto.accountName     !== undefined) updates.account_name     = dto.accountName
  if (dto.abn             !== undefined) updates.abn              = dto.abn
  if (dto.contactName     !== undefined) updates.contact_name     = dto.contactName
  if (dto.contactEmail    !== undefined) updates.contact_email    = dto.contactEmail
  if (dto.contactPhone    !== undefined) updates.contact_phone    = dto.contactPhone
  if (dto.billingAddress  !== undefined) updates.billing_address  = dto.billingAddress
  if (dto.billingCity     !== undefined) updates.billing_city     = dto.billingCity
  if (dto.billingState    !== undefined) updates.billing_state    = dto.billingState
  if (dto.billingPostcode !== undefined) updates.billing_postcode = dto.billingPostcode
  if (dto.billingCountry  !== undefined) updates.billing_country  = dto.billingCountry
  if (dto.creditLimit     !== undefined) updates.credit_limit     = dto.creditLimit
  if (dto.paymentTerms    !== undefined) updates.payment_terms    = dto.paymentTerms
  if (dto.isActive        !== undefined) updates.is_active        = dto.isActive

  const { data, error } = await accountsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update account')
  return data
}

export async function updateCompanyLogo(accountId: string, dto: UpdateCompanyLogoDto) {
  const { data, error } = await accountsRepo.updateById(accountId, {
    logo_url:   dto.logoUrl,
    updated_at: new Date().toISOString(),
  })
  if (error || !data) throw AppError.internal('Failed to update company logo')
  return data
}

export async function deactivateAccount(id: string) {
  await getAccount(id)
  const { error } = await accountsRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to deactivate account')
}

// ── Admin: Account Notes ──────────────────────────────────────────────────────
export async function listAccountNotes(accountId: string) {
  await getAccount(accountId)

  const { data, error } = await accountsRepo.findNotesByAccountId(accountId)
  if (error) throw AppError.internal('Failed to fetch notes')

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

  if (error || !data) throw AppError.internal('Failed to create note')
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
  if (error || !data) throw AppError.internal('Failed to update note')
  return data
}

export async function deleteAccountNote(accountId: string, noteId: string) {
  const { data: existing, error: findErr } = await accountsRepo.findNoteById(noteId, accountId)
  if (findErr || !existing) throw AppError.notFound('Note')

  const { error } = await accountsRepo.softDeleteNoteById(noteId)
  if (error) throw AppError.internal('Failed to delete note')
}

// ── Shipper: own account (company) ───────────────────────────────────────────
export async function getOwnProfile(userId: string) {
  const { data, error } = await accountsRepo.findAccountByUserId(userId)
  if (error || !data) throw AppError.notFound('Account')
  return data
}

export async function updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
  const updates: Record<string, unknown> = {}
  if (dto.fullName !== undefined) updates.full_name = dto.fullName
  if (dto.phone    !== undefined) updates.phone     = dto.phone

  const { data, error } = await accountsRepo.updateProfileById(userId, updates)
  if (error || !data) throw AppError.internal('Failed to update profile')
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
  if (error || !data) throw AppError.internal('Failed to generate logo upload URL')

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
  if (error) throw AppError.internal('Failed to clear company logo')
}
