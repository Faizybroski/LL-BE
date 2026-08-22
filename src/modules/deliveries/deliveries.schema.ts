import { z } from 'zod'

// ── Status machine ────────────────────────────────────────────────────────────
// pending → confirmed → assigned → picked_up → in_transit → out_for_delivery → delivered
// Any pre-terminal state can be cancelled.

export const DELIVERY_STATUSES = [
  'pending',
  'confirmed',
  'assigned',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending:          ['confirmed',        'cancelled'],
  confirmed:        ['assigned',         'cancelled'],
  assigned:         ['picked_up',        'cancelled'],
  picked_up:        ['in_transit',       'cancelled'],
  in_transit:       ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered',        'cancelled'],
  delivered:        [],
  cancelled:        [],
}

export const DELETABLE_STATUSES: DeliveryStatus[] = ['pending', 'confirmed']

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createDeliverySchema = z.object({
  deliveryType: z.enum(['freight', 'last_mile']).default('freight'),
  /** Specific last-mile service (courier/medical/grocery/etc) when deliveryType is 'last_mile'. Plain string — extensible without a migration. */
  serviceType:  z.string().min(1).max(50).optional(),
  /** e.g. Standard/Express/Same-Day/Priority — distinct from serviceType. */
  serviceLevel: z.string().min(1).max(50).optional(),
  /** Pallet/Box/Crate/Envelope/Other — plain string, extensible without a migration. */
  packageType:  z.string().min(1).max(50).optional(),
  /** The customer's requested delivery date — distinct from estimatedDeliveryDate (the ops estimate). */
  preferredDeliveryDate: z.string().datetime({ offset: true }).optional(),
  /** UUID of the shipping company (accounts.account_id) to pre-assign this delivery to. */
  accountId:    z.string().uuid('Invalid account ID').optional(),
  /** UUID of the residential customer (profiles.id) this delivery belongs to. Mutually exclusive with accountId. */
  customerId:   z.string().uuid('Invalid customer ID').optional(),

  originAddress:  z.string().min(5),
  originCity:     z.string().min(1),
  originState:    z.string().min(1),
  originPostcode: z.string().min(2),
  originCountry:  z.string().default('Australia'),

  destinationAddress:  z.string().min(5),
  destinationCity:     z.string().min(1),
  destinationState:    z.string().min(1),
  destinationPostcode: z.string().min(2),
  destinationCountry:  z.string().default('Australia'),

  cargoDescription:      z.string().min(3),
  weightKg:              z.number().positive().optional(),
  volumeM3:              z.number().positive().optional(),
  pieces:                z.number().int().positive().optional(),
  isDangerousGoods:      z.boolean().default(false),
  requiresRefrigeration: z.boolean().default(false),

  estimatedPickupDate:   z.string().datetime({ offset: true }).optional(),
  estimatedDeliveryDate: z.string().datetime({ offset: true }).optional(),

  quotedPrice: z.number().min(0).optional(),
  currency:    z.string().length(3).default('CAD'),

  specialInstructions: z.string().optional(),
  // Confirmation number is auto-generated (LLC-#### via DB trigger) — not accepted on create.
})

export const updateDeliverySchema = createDeliverySchema
  .omit({ deliveryType: true })
  .extend({
    confirmedPrice:     z.number().min(0).optional(),
    actualPickupDate:   z.string().datetime({ offset: true }).optional(),
    actualDeliveryDate: z.string().datetime({ offset: true }).optional(),
    // Confirmation number can be corrected post-creation.
    referenceNumber:    z.string().optional(),
  })
  .partial()

export const updateDeliveryStatusSchema = z.object({
  status: z.string().min(1).max(100),
  reason: z.string().optional(),
})

// Admin assigns a delivery to one or more Logical Links staff members at
// once (e.g. a driver AND a dispatcher) — any active employee, not just
// drivers. Replaces the delivery's whole assignee set; pass an empty array
// to unassign everyone.
export const assignEmployeesSchema = z.object({
  employeeIds: z.array(z.string().uuid('Invalid employee user ID')).max(20),
})

export const deleteDeliverySchema = z.object({
  reason: z.string().min(3, 'Deletion reason required'),
})

export const listDeliveriesSchema = z.object({
  page:          z.coerce.number().int().positive().default(1),
  limit:         z.coerce.number().int().positive().max(100).default(20),
  status:        z.string().max(100).optional(),
  statuses:      z.string().max(500).optional(), // comma-separated status list, takes precedence over status
  deliveryType:  z.enum(['freight', 'last_mile']).optional(),
  accountId:     z.string().uuid().optional(),
  customerId:    z.string().uuid().optional(),
  search:        z.string().max(100).optional(),
  createdByRole: z.enum(['admin', 'corporate']).optional(),
  dateFrom:      z.string().max(30).optional(),
  dateTo:        z.string().max(30).optional(),
  updatedFrom:   z.string().max(30).optional(),
  updatedTo:     z.string().max(30).optional(),
  sortBy:        z.enum(['load_number', 'status', 'shipment_type', 'created_at', 'updated_at', 'estimated_delivery_date']).optional(),
  sortDir:       z.enum(['asc', 'desc']).optional(),
})

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateDeliveryDto       = z.infer<typeof createDeliverySchema>
export type UpdateDeliveryDto       = z.infer<typeof updateDeliverySchema>
export type UpdateDeliveryStatusDto = z.infer<typeof updateDeliveryStatusSchema>
export type AssignEmployeesDto      = z.infer<typeof assignEmployeesSchema>
export type DeleteDeliveryDto       = z.infer<typeof deleteDeliverySchema>
export type ListDeliveriesQuery      = z.infer<typeof listDeliveriesSchema>
