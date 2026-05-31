import { z } from 'zod'

// ── Status machine ────────────────────────────────────────────────────────────
// pending → confirmed → assigned → picked_up → in_transit → out_for_delivery → delivered
// Any pre-terminal state can be cancelled.

export const SHIPMENT_STATUSES = [
  'pending',
  'confirmed',
  'assigned',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export const STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending:          ['confirmed',        'cancelled'],
  confirmed:        ['assigned',         'cancelled'],
  assigned:         ['picked_up',        'cancelled'],
  picked_up:        ['in_transit',       'cancelled'],
  in_transit:       ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered',        'cancelled'],
  delivered:        [],
  cancelled:        [],
}

export const DELETABLE_STATUSES: ShipmentStatus[] = ['pending', 'confirmed']

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createShipmentSchema = z.object({
  shipmentType: z.enum(['freight', 'last_mile']).default('freight'),
  shipperId:    z.string().uuid('Invalid shipper user ID').optional(),

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
  currency:    z.string().length(3).default('AUD'),

  specialInstructions: z.string().optional(),
  referenceNumber:     z.string().optional(),
})

export const updateShipmentSchema = createShipmentSchema
  .omit({ shipmentType: true, shipperId: true })
  .extend({
    confirmedPrice:     z.number().min(0).optional(),
    actualPickupDate:   z.string().datetime({ offset: true }).optional(),
    actualDeliveryDate: z.string().datetime({ offset: true }).optional(),
  })
  .partial()

export const updateShipmentStatusSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  reason: z.string().optional(),
})

// Admin assigns a load to a specific shipper user (identified by their user ID).
// The service resolves the user's account_id from their profile.
export const assignShipmentSchema = z.object({
  userId: z.string().uuid('Invalid shipper user ID'),
})

export const deleteShipmentSchema = z.object({
  reason: z.string().min(3, 'Deletion reason required'),
})

export const listShipmentsSchema = z.object({
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
  status:       z.enum(SHIPMENT_STATUSES).optional(),
  shipmentType: z.enum(['freight', 'last_mile']).optional(),
  accountId:    z.string().uuid().optional(),
  search:       z.string().max(100).optional(),
})

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateShipmentDto       = z.infer<typeof createShipmentSchema>
export type UpdateShipmentDto       = z.infer<typeof updateShipmentSchema>
export type UpdateShipmentStatusDto = z.infer<typeof updateShipmentStatusSchema>
export type AssignShipmentDto       = z.infer<typeof assignShipmentSchema>
export type DeleteShipmentDto       = z.infer<typeof deleteShipmentSchema>
export type ListShipmentsQuery      = z.infer<typeof listShipmentsSchema>
