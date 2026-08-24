import { z } from 'zod'

export const NOTIFICATION_TYPES = [
  'shipment_created',
  'shipment_updated',
  'shipment_assigned',
  'shipment_picked_up',
  'shipment_in_transit',
  'shipment_out_for_delivery',
  'shipment_delivered',
  'shipment_cancelled',
  'shipment_eta_updated',
  'shipment_deleted',
  'assignment_created',
  'tracking_event_created',
  'tracking_event_updated',
  'tracking_event_deleted',
  'invoice_issued',
  'invoice_paid',
  'invoice_overdue',
  'invoice_deleted',
  'quotation_requested',
  'quotation_sent',
  'quotation_updated',
  'quotation_accepted',
  'quotation_rejected',
  'quotation_deleted',
  'support_case_created',
  'support_case_updated',
  'support_case_replied',
  'support_case_status_changed',
  'support_case_deleted',
  'system',
  'admin_alert',
  'account_created',
  'account_updated',
  'account_note_created',
  'account_note_updated',
  'employee_created',
  'employee_updated',
  'admin_employee_created',
  'admin_employee_updated',
  'note_created',
  'note_updated',
  'note_deleted',
  'location_created',
  'location_updated',
  'location_deleted',
  'status_created',
  'status_updated',
  'status_deleted',
  'user_role_updated',
] as const

export const NOTIFICATION_CATEGORIES = {
  deliveries: [
    'shipment_created',
    'shipment_updated',
    'shipment_assigned',
    'shipment_picked_up',
    'shipment_in_transit',
    'shipment_out_for_delivery',
    'shipment_delivered',
    'shipment_cancelled',
    'shipment_eta_updated',
    'shipment_deleted',
    'assignment_created',
    'tracking_event_created',
    'tracking_event_updated',
    'tracking_event_deleted',
  ],
  invoices: ['invoice_issued', 'invoice_paid', 'invoice_overdue', 'invoice_deleted'],
  quotes: ['quotation_requested', 'quotation_sent', 'quotation_updated', 'quotation_accepted', 'quotation_rejected', 'quotation_deleted'],
  support: ['support_case_created', 'support_case_updated', 'support_case_replied', 'support_case_status_changed', 'support_case_deleted'],
  account: [
    'system',
    'account_created',
    'account_updated',
    'account_note_created',
    'account_note_updated',
  ],
  team: [
    'employee_created',
    'employee_updated',
    'admin_employee_created',
    'admin_employee_updated',
    'user_role_updated',
  ],
  operations: [
    'note_created',
    'note_updated',
    'note_deleted',
    'location_created',
    'location_updated',
    'location_deleted',
    'status_created',
    'status_updated',
    'status_deleted',
  ],
} as const satisfies Record<string, readonly (typeof NOTIFICATION_TYPES)[number][]>

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

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

// ── Admin-authored alerts ──────────────────────────────────────────────────────
// `category` reuses the same NOTIFICATION_CATEGORIES keys as the module tabs so
// an alert about e.g. invoices surfaces under the existing Invoices tab.
export const createAlertSchema = z
  .object({
    title:     z.string().min(1, 'Title is required').max(200),
    body:      z.string().min(1, 'Message is required').max(2000),
    severity:  z.enum(['info', 'warning', 'critical']).default('info'),
    category:  z.enum(Object.keys(NOTIFICATION_CATEGORIES) as [NotificationCategory, ...NotificationCategory[]]),
    target:    z.enum(['account', 'all']),
    accountId: z.string().uuid().optional(),
  })
  .refine((d) => d.target === 'all' || !!d.accountId, {
    message: 'accountId is required when target is "account"',
    path: ['accountId'],
  })

export type CreateNotificationDto = z.infer<typeof createNotificationSchema>
export type MarkReadDto = z.infer<typeof markReadSchema>
export type CreateAlertDto = z.infer<typeof createAlertSchema>
