import { z } from 'zod'
import { LINE_ITEM_CATEGORIES } from '../quotations/quotations.schema'

export { LINE_ITEM_CATEGORIES }

export const INVOICE_STATUSES = ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const

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

export const createInvoiceSchema = z.object({
  profileId:           z.string().uuid('Invalid profile ID'),
  loadId:              z.string().uuid().optional().nullable(),
  quotationId:         z.string().uuid().optional().nullable(),
  status:              z.enum(INVOICE_STATUSES).default('draft'),
  issueDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  dueDate:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  customerName:        z.string().min(1, 'Customer name is required').max(255),
  customerCompany:     z.string().max(255).optional().nullable(),
  customerEmail:       z.string().email().optional().nullable(),
  customerPhone:       z.string().max(50).optional().nullable(),
  billingAddress:      z.string().max(500).optional().nullable(),
  notes:               z.string().max(5000).optional().nullable(),
  terms:               z.string().max(5000).optional().nullable(),
  paymentInstructions: z.string().max(2000).optional().nullable(),
  subtotal:            z.coerce.number().min(0).default(0),
  discount:            z.coerce.number().min(0).default(0),
  taxRate:             z.coerce.number().min(0).max(1).default(0),
  tax:                 z.coerce.number().min(0).default(0),
  total:               z.coerce.number().min(0).default(0),
  amountPaid:          z.coerce.number().min(0).default(0),
  currency:            z.string().length(3).default('AUD'),
  items:               z.array(lineItemSchema).min(0).default([]),
})

export const updateInvoiceSchema = createInvoiceSchema
  .omit({ profileId: true })
  .partial()
  .extend({
    items: z.array(lineItemSchema).optional(),
  })

export const listInvoicesQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(500).default(20),
  profileId:    z.string().uuid().optional(),
  loadId:       z.string().uuid().optional(),
  status:       z.enum(INVOICE_STATUSES).optional(),
  search:       z.string().max(200).optional(),
  dueDateFrom:  z.string().max(30).optional(),
  dueDateTo:    z.string().max(30).optional(),
  totalMin:     z.coerce.number().min(0).optional(),
  totalMax:     z.coerce.number().min(0).optional(),
  hasPdf:       z.enum(['true', 'false']).optional(),
  sortBy:       z.enum(['invoice_number', 'status', 'due_date', 'total', 'balance_due', 'created_at']).optional(),
  sortDir:      z.enum(['asc', 'desc']).optional(),
})

export type CreateInvoiceDto   = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceDto   = z.infer<typeof updateInvoiceSchema>
export type ListInvoicesQuery  = z.infer<typeof listInvoicesQuerySchema>
export type InvoiceLineItemDto = z.infer<typeof lineItemSchema>
