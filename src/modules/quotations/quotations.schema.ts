import { z } from 'zod'

export const LINE_ITEM_CATEGORIES = [
  'freight_charge', 'line_haul', 'fuel_surcharge', 'accessorial',
  'loading_fee', 'unloading_fee', 'lumper_fee', 'toll_charges',
  'detention', 'layover', 'storage_fee', 'customs_fee',
  'administrative_fee', 'insurance', 'miscellaneous', 'custom',
] as const

// 'requested' = a customer-submitted quote request with no price yet,
// awaiting admin pricing — distinct from 'draft' (internal admin work in
// progress, never shown to the customer).
export const QUOTATION_STATUSES = ['requested', 'draft', 'sent', 'accepted', 'rejected', 'expired'] as const

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
  currency:        z.string().length(3).default('CAD'),
  originAddress:      z.string().max(500).optional().nullable(),
  originLat:          z.coerce.number().optional().nullable(),
  originLng:          z.coerce.number().optional().nullable(),
  destinationAddress: z.string().max(500).optional().nullable(),
  destinationLat:     z.coerce.number().optional().nullable(),
  destinationLng:     z.coerce.number().optional().nullable(),
  distanceKm:         z.coerce.number().min(0).optional().nullable(),
  originCity:            z.string().max(100).optional().nullable(),
  originState:           z.string().max(100).optional().nullable(),
  originPostcode:        z.string().max(20).optional().nullable(),
  destinationCity:       z.string().max(100).optional().nullable(),
  destinationState:      z.string().max(100).optional().nullable(),
  destinationPostcode:   z.string().max(20).optional().nullable(),
  cargoDescription:      z.string().max(500).optional().nullable(),
  serviceType:           z.string().max(50).optional().nullable(),
  serviceLevel:          z.string().max(50).optional().nullable(),
  weightKg:              z.coerce.number().min(0).optional().nullable(),
  pieces:                z.coerce.number().int().min(1).optional().nullable(),
  preferredDeliveryDate: z.string().datetime({ offset: true }).optional().nullable(),
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

// ── Self-service quote request (customer workflow) ─────────────────────────────
// Residential customers get an instant auto-priced quote — every field the
// pricing engine needs is required. Corporate customers only submit a
// request (no pricing fields) — an admin prices it afterward via the
// existing PATCH /:id + line items flow. Both forms capture the same set of
// contact/delivery-detail fields (Aug 22 spec); "customerCompany" is only
// meaningful for corporate but stays optional on both schemas.
const quoteRequestCommonFields = {
  customerName:    z.string().min(1, 'Customer name is required').max(255),
  customerCompany: z.string().max(255).optional().nullable(),
  customerEmail:   z.string().email('Enter a valid email').max(255),
  customerPhone:   z.string().min(1, 'Phone number is required').max(50),
  originAddress:        z.string().min(5).max(500),
  originLat:             z.coerce.number(),
  originLng:             z.coerce.number(),
  originCity:            z.string().min(1).max(100),
  originState:           z.string().min(1).max(100),
  originPostcode:        z.string().min(1).max(20),
  destinationAddress:      z.string().min(5).max(500),
  destinationLat:          z.coerce.number(),
  destinationLng:          z.coerce.number(),
  destinationCity:         z.string().min(1).max(100),
  destinationState:        z.string().min(1).max(100),
  destinationPostcode:     z.string().min(1).max(20),
  serviceType:          z.string().min(1, 'Select a service type').max(50),
  serviceLevel:         z.string().min(1, 'Select a service level').max(50),
  cargoDescription:      z.string().min(3, 'Please describe what needs to be delivered').max(500),
  pieces:               z.coerce.number().int().min(1, 'Enter the number of packages'),
  weightKg:             z.coerce.number().positive('Enter the weight in kg'),
  preferredDeliveryDate: z.string().datetime({ offset: true, message: 'Select a preferred delivery date' }),
  notes:                z.string().max(5000).optional().nullable(),
}

// Shared by both self-service "instant quote" flows (residential — always;
// corporate — the "same as residential" option instead of requesting a
// manual quote). Nothing is written to the DB for the price-preview step
// itself (that's just POST /pricing/calculate) — this shape is only used
// once the customer decides, via the /decide endpoints below.
const autoQuoteRequestFields = {
  ...quoteRequestCommonFields,
  distanceKm:           z.coerce.number().min(0),
  additionalChargeKeys: z.array(z.string()).default([]),
}

export const residentialQuoteRequestSchema = z.object(autoQuoteRequestFields)

// POST .../decide — the customer's accept/decline choice on a self-service
// instant quote. The quotation row is only created here, directly at its
// final status ('accepted' or 'rejected') — never passes through 'sent'.
// termsVersion/acknowledged are required only when accepting (mirrors
// acceptQuotationSchema's mandatory Terms & Conditions enforcement).
export const decideAutoQuoteSchema = z.object({
  ...autoQuoteRequestFields,
  decision:     z.enum(['accept', 'decline']),
  termsVersion: z.string().min(1).optional(),
  acknowledged: z.boolean().optional(),
  // Residential only: redeem rewards points toward this quote on accept
  // (capped at 50% of the total — see rewardsCreditService).
  applyRewards: z.boolean().optional(),
}).refine(
  (dto) => dto.decision !== 'accept' || (!!dto.termsVersion && dto.acknowledged === true),
  { message: 'You must acknowledge the Terms & Conditions to accept', path: ['acknowledged'] },
)

// Corporate manual quote request — no pricing fields, an admin prices it
// afterward. additionalChargeKeys is a wishlist only: nothing is priced
// yet, just recorded so admin's Pricing Calculator can pre-tick the same
// options the customer asked for (see requested_additional_charge_keys,
// migration 062).
export const corporateQuoteRequestSchema = z.object({
  ...quoteRequestCommonFields,
  additionalChargeKeys: z.array(z.string()).default([]),
})

export type CreateQuotationDto   = z.infer<typeof createQuotationSchema>
export type UpdateQuotationDto   = z.infer<typeof updateQuotationSchema>
export type ListQuotationsQuery  = z.infer<typeof listQuotationsQuerySchema>
export type QuotationLineItemDto = z.infer<typeof lineItemSchema>
export type AcceptQuotationDto   = z.infer<typeof acceptQuotationSchema>
export type ResidentialQuoteRequestDto = z.infer<typeof residentialQuoteRequestSchema>
export type DecideAutoQuoteDto         = z.infer<typeof decideAutoQuoteSchema>
export type CorporateQuoteRequestDto   = z.infer<typeof corporateQuoteRequestSchema>
