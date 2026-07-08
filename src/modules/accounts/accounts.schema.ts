import { z } from 'zod'

// ── Account CRUD ──────────────────────────────────────────────────────────────
export const createAccountSchema = z.object({
  accountName:     z.string().min(2).max(200),
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
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

// ── Shipper: own company update (company_admin only, own account) ────────────
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
})
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const listAccountsQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  search:    z.string().optional(),
  isActive:  z.enum(['true', 'false']).optional(),
  dateFrom:  z.string().max(30).optional(),
  dateTo:    z.string().max(30).optional(),
  sortBy:    z.enum(['account_name', 'is_active', 'created_at']).optional(),
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

// ── Shipper: own profile update ───────────────────────────────────────────────
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
export type ListAccountsQuery     = z.infer<typeof listAccountsQuerySchema>
export type CreateAccountNoteDto  = z.infer<typeof createAccountNoteSchema>
export type UpdateAccountNoteDto  = z.infer<typeof updateAccountNoteSchema>
export type UpdateOwnProfileDto   = z.infer<typeof updateOwnProfileSchema>
export type UpdateCompanyLogoDto  = z.infer<typeof updateCompanyLogoSchema>
export type UpdateOwnCompanyDto   = z.infer<typeof updateOwnCompanySchema>
