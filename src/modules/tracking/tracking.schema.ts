import { z } from 'zod'

export const TRACKING_STATUSES = [
  'created',
  'assigned',
  'confirmed',
  'picked_up',
  'arrived_at_facility',
  'departed_facility',
  'in_transit',
  'customs_clearance',
  'customs_hold',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned',
  'exception',
] as const

export type TrackingStatus = (typeof TRACKING_STATUSES)[number]

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  created:             'Created',
  assigned:            'Assigned',
  confirmed:           'Confirmed',
  picked_up:           'Picked Up',
  arrived_at_facility: 'Arrived At Facility',
  departed_facility:   'Departed Facility',
  in_transit:          'In Transit',
  customs_clearance:   'Customs Clearance',
  customs_hold:        'Customs Hold',
  out_for_delivery:    'Out For Delivery',
  delivered:           'Delivered',
  delivery_failed:     'Delivery Failed',
  returned:            'Returned',
  exception:           'Exception',
}

export const createTrackingEventSchema = z.object({
  loadId:          z.string().uuid('Invalid load ID'),
  locationId:      z.string().uuid('Invalid location ID').optional(),
  trackingStatus:  z.enum(TRACKING_STATUSES),
  notes:           z.string().max(1000).optional(),
  eventTimestamp:  z.string().datetime({ offset: true }).optional(),
})

export const updateTrackingEventSchema = z.object({
  locationId:     z.string().uuid('Invalid location ID').nullable().optional(),
  trackingStatus: z.enum(TRACKING_STATUSES).optional(),
  notes:          z.string().max(1000).nullable().optional(),
  eventTimestamp: z.string().datetime({ offset: true }).optional(),
})

export const listTrackingEventsSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(50),
  loadId: z.string().uuid().optional(),
})

export type CreateTrackingEventDto = z.infer<typeof createTrackingEventSchema>
export type UpdateTrackingEventDto = z.infer<typeof updateTrackingEventSchema>
export type ListTrackingEventsQuery = z.infer<typeof listTrackingEventsSchema>
