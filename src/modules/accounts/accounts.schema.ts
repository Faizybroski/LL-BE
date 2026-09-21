import { z } from 'zod'

// ── Pipeline (CRM) status ────────────────────────────────────────────────────
// Sales stage of a corporate customer. Portal login access is derived from this
// (accounts.service.syncPortalAccess) — true only for 'onboarding' / 'active'.
export const CORPORATE_PIPELINE_STATUSES = [
  'prospect',
  'contacted',
  'interested',
  'onboarding',
  'active',
  'inactive',
  'lost',
] as const

export type CorporatePipelineStatus = (typeof CORPORATE_PIPELINE_STATUSES)[number]

export const PORTAL_ACCESS_STATUSES: CorporatePipelineStatus[] = ['onboarding', 'active']

const pipelineStatusSchema = z.enum(CORPORATE_PIPELINE_STATUSES)

// ── Account CRUD ──────────────────────────────────────────────────────────────
export const createAccountSchema = z.object({
  accountName:     z.string().min(2).max(200),
  pipelineStatus:  pipelineStatusSchema.optional(),
  abn:             z.string().optional(),
  website:         z.string().url().optional(),
  contactName:     z.string().optional(),
  contactEmail:    z.string().email().optional(),
  contactPhone:    z.string().optional(),
  addressLine1:    z.string().optional(),
  addressCity:     z.string().optional(),
  addressState:    z.string().optional(),
  addressPostcode: z.string().optional(),
  addressCountry:  z.string().optional(),
  billingEmail:        z.string().email().optional(),
  accountsPayableEmail: z.string().email().optional(),
  billingAddress:  z.string().optional(),
  billingCity:     z.string().optional(),
  billingState:    z.string().optional(),
  billingPostcode: z.string().optional(),
  billingCountry:  z.string().default('Australia'),
  creditLimit:     z.number().min(0).default(0),
  paymentTerms:    z.number().int().min(0).default(30),
})

export const updateAccountSchema = createAccountSchema
  .omit({ billingCountry: true, creditLimit: true, paymentTerms: true })
  .extend({
    billingCountry: z.string().optional(),
    creditLimit:    z.number().min(0).optional(),
    paymentTerms:   z.number().int().min(0).optional(),
    isActive:       z.boolean().optional(),
    businessType:   z.string().max(100).optional(),
    industry:       z.string().max(100).optional(),
    pipelineStatus: pipelineStatusSchema.optional(),
    // CRM follow-up tracking
    lastContactedAt:   z.string().max(30).nullable().optional(),
    nextFollowUpAt:    z.string().max(30).nullable().optional(),
    assignedEmployeeId: z.string().uuid().nullable().optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

// ── Reject a corporate account request ───────────────────────────────────────
// The admin picks one of a fixed set of reasons. Each reason maps to a canned
// internal note and a canned customer email (see ./rejection-reasons.ts).
// 'other' is the only reason that requires the admin to type a note.
export const REJECTION_REASONS = [
  'incomplete_information',
  'business_verification_failed',
  'services_not_available',
  'requirements_not_met',
  'commercial_terms_unsuitable',
  'other',
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

export const rejectAccountSchema = z
  .object({
    reason: z.enum(REJECTION_REASONS),
    note:   z.string().max(2000).optional(),
  })
  .refine((v) => v.reason !== 'other' || (v.note?.trim().length ?? 0) >= 3, {
    message: 'A note is required when the reason is "Other"',
    path: ['note'],
  })

// ── Corporate: own company update (company_admin only, own account) ────────────
// Deliberately excludes credit_limit/payment_terms/isActive — commercial terms
// stay admin-managed even though the company_admin can edit their own contacts.
export const updateOwnCompanySchema = z.object({
  accountName:          z.string().min(2).max(200).optional(),
  abn:                  z.string().optional(),
  website:              z.string().url().optional().or(z.literal('')),
  addressLine1:         z.string().optional(),
  addressCity:          z.string().optional(),
  addressState:         z.string().optional(),
  addressPostcode:      z.string().optional(),
  addressCountry:       z.string().optional(),
  contactName:          z.string().optional(),
  contactEmail:         z.string().email().optional().or(z.literal('')),
  contactPhone:         z.string().optional(),
  billingEmail:         z.string().email().optional().or(z.literal('')),
  accountsPayableEmail: z.string().email().optional().or(z.literal('')),
  businessType:         z.string().max(100).optional(),
  industry:             z.string().max(100).optional(),
})
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const listAccountsQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  search:    z.string().optional(),
  isActive:  z.enum(['true', 'false']).optional(),
  pipelineStatus: pipelineStatusSchema.optional(),
  // 'true' shows the soft-deleted rejected accounts (90-day retention window).
  rejected:  z.enum(['true', 'false']).optional(),
  dateFrom:  z.string().max(30).optional(),
  dateTo:    z.string().max(30).optional(),
  sortBy:    z.enum(['account_name', 'is_active', 'created_at', 'pipeline_status']).optional(),
  sortDir:   z.enum(['asc', 'desc']).optional(),
})

// ── Account Notes (admin-only) ────────────────────────────────────────────────
export const createAccountNoteSchema = z.object({
  content:    z.string().min(1).max(5000),
  isInternal: z.boolean().default(true),
})

export const updateAccountNoteSchema = z.object({
  content: z.string().min(1).max(5000),
})

// ── Corporate: own profile update ───────────────────────────────────────────────
export const updateOwnProfileSchema = z
  .object({
    fullName: z.string().min(2).optional(),
    phone:    z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

// ── Company logo update (company_admin only) ──────────────────────────────────
export const updateCompanyLogoSchema = z.object({
  logoUrl: z.string().url().nullable(),
})

// ── DTO types ─────────────────────────────────────────────────────────────────
export type CreateAccountDto      = z.infer<typeof createAccountSchema>
export type UpdateAccountDto      = z.infer<typeof updateAccountSchema>
export type RejectAccountDto      = z.infer<typeof rejectAccountSchema>
export type ListAccountsQuery     = z.infer<typeof listAccountsQuerySchema>
export type CreateAccountNoteDto  = z.infer<typeof createAccountNoteSchema>
export type UpdateAccountNoteDto  = z.infer<typeof updateAccountNoteSchema>
export type UpdateOwnProfileDto   = z.infer<typeof updateOwnProfileSchema>
export type UpdateCompanyLogoDto  = z.infer<typeof updateCompanyLogoSchema>
export type UpdateOwnCompanyDto   = z.infer<typeof updateOwnCompanySchema>
