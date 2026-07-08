import { z } from 'zod'

export const LINE_ITEM_CATEGORIES = [
  'freight_charge', 'line_haul', 'fuel_surcharge', 'accessorial',
  'loading_fee', 'unloading_fee', 'lumper_fee', 'toll_charges',
  'detention', 'layover', 'storage_fee', 'customs_fee',
  'administrative_fee', 'insurance', 'miscellaneous', 'custom',
] as const

export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const

const lineItemSchema = z.object({
  id:          z.string().uuid().optional(),
  description: z.string().min(1, 'Description is required').max(500),
  category:    z.enum(LINE_ITEM_CATEGORIES).default('miscellaneous'),
  quantity:    z.coerce.number().positive('Quantity must be positive'),
  unit:        z.string().max(50).default('unit'),
  unit_price:  z.coerce.number().min(0, 'Unit price cannot be negative'),
  amount:      z.coerce.number().min(0).optional(),
  notes:       z.string().max(500).optional(),
  sort_order:  z.coerce.number().int().min(0).default(0),
})

export const createQuotationSchema = z.object({
  profileId:       z.string().uuid('Invalid profile ID'),
  loadId:          z.string().uuid().optional().nullable(),
  status:          z.enum(QUOTATION_STATUSES).default('draft'),
  issueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  expiryDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  customerName:    z.string().min(1, 'Customer name is required').max(255),
  customerCompany: z.string().max(255).optional().nullable(),
  customerEmail:   z.string().email().optional().nullable(),
  customerPhone:   z.string().max(50).optional().nullable(),
  billingAddress:  z.string().max(500).optional().nullable(),
  notes:           z.string().max(5000).optional().nullable(),
  terms:           z.string().max(5000).optional().nullable(),
  subtotal:        z.coerce.number().min(0).default(0),
  discount:        z.coerce.number().min(0).default(0),
  taxRate:         z.coerce.number().min(0).max(1).default(0),
  tax:             z.coerce.number().min(0).default(0),
  total:           z.coerce.number().min(0).default(0),
  currency:        z.string().length(3).default('AUD'),
  items:           z.array(lineItemSchema).min(0).default([]),
})

export const updateQuotationSchema = createQuotationSchema
  .omit({ profileId: true })
  .partial()
  .extend({
    items: z.array(lineItemSchema).optional(),
  })

export const listQuotationsQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(500).default(20),
  profileId:      z.string().uuid().optional(),
  loadId:         z.string().uuid().optional(),
  status:         z.enum(QUOTATION_STATUSES).optional(),
  search:         z.string().max(200).optional(),
  issueDateFrom:  z.string().max(30).optional(),
  issueDateTo:    z.string().max(30).optional(),
  expiryDateFrom: z.string().max(30).optional(),
  expiryDateTo:   z.string().max(30).optional(),
  totalMin:       z.coerce.number().min(0).optional(),
  totalMax:       z.coerce.number().min(0).optional(),
  hasPdf:         z.enum(['true', 'false']).optional(),
  sortBy:         z.enum(['quotation_number', 'status', 'issue_date', 'expiry_date', 'total', 'created_at']).optional(),
  sortDir:        z.enum(['asc', 'desc']).optional(),
})

export const generatePdfSchema = z.object({})

// ── Accept / Decline (customer workflow) ──────────────────────────────────────
// acknowledged must literally be `true` — this is the server-side enforcement
// of the mandatory Terms & Conditions checkbox; the request fails validation
// if the client didn't set it, so acceptance can never be recorded without it.
export const acceptQuotationSchema = z.object({
  termsVersion: z.string().min(1, 'Terms version is required'),
  acknowledged: z.literal(true, { message: 'You must acknowledge the Terms & Conditions' }),
})

export type CreateQuotationDto   = z.infer<typeof createQuotationSchema>
export type UpdateQuotationDto   = z.infer<typeof updateQuotationSchema>
export type ListQuotationsQuery  = z.infer<typeof listQuotationsQuerySchema>
export type QuotationLineItemDto = z.infer<typeof lineItemSchema>
export type AcceptQuotationDto   = z.infer<typeof acceptQuotationSchema>
