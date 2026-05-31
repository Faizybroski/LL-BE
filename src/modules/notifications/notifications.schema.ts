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
  'system',
] as const

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
