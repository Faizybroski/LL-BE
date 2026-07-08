import { z } from 'zod'

export const NOTIFICATION_TYPES = [
  'shipment_created',
  'shipment_assigned',
  'shipment_picked_up',
  'shipment_in_transit',
  'shipment_out_for_delivery',
  'shipment_delivered',
  'shipment_cancelled',
  'assignment_created',
  'tracking_event_created',
  'tracking_event_updated',
  'tracking_event_deleted',
  'invoice_issued',
  'invoice_paid',
  'invoice_overdue',
  'quotation_sent',
  'quotation_accepted',
  'quotation_rejected',
  'support_case_replied',
  'support_case_status_changed',
  'system',
] as const

export const NOTIFICATION_CATEGORIES = {
  deliveries: [
    'shipment_created',
    'shipment_assigned',
    'shipment_picked_up',
    'shipment_in_transit',
    'shipment_out_for_delivery',
    'shipment_delivered',
    'shipment_cancelled',
    'assignment_created',
    'tracking_event_created',
    'tracking_event_updated',
    'tracking_event_deleted',
  ],
  invoices: ['invoice_issued', 'invoice_paid', 'invoice_overdue'],
  quotes: ['quotation_sent', 'quotation_accepted', 'quotation_rejected'],
  support: ['support_case_replied', 'support_case_status_changed'],
  account: ['system'],
} as const satisfies Record<string, readonly (typeof NOTIFICATION_TYPES)[number][]>

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES

export const createNotificationSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().min(1),
  body: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
})

export const markReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(50),
})

export type CreateNotificationDto = z.infer<typeof createNotificationSchema>
export type MarkReadDto = z.infer<typeof markReadSchema>
