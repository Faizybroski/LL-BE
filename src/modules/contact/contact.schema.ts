import { z } from 'zod'

export const CONTACT_MESSAGE_STATUSES = ['new', 'in_progress', 'resolved'] as const

export const submitContactMessageSchema = z.object({
  name:    z.string().min(1, 'Name is required').max(200),
  email:   z.string().email('A valid email is required').max(320),
  phone:   z.string().max(50).optional(),
  subject: z.string().min(1, 'Subject is required').max(200),
  message: z.string().min(1, 'Message is required').max(5000),
})

export const updateContactMessageStatusSchema = z.object({
  status: z.enum(CONTACT_MESSAGE_STATUSES),
})

export const listContactMessagesQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(CONTACT_MESSAGE_STATUSES).optional(),
  search: z.string().max(200).optional(),
})

export type SubmitContactMessageDto     = z.infer<typeof submitContactMessageSchema>
export type UpdateContactMessageStatusDto = z.infer<typeof updateContactMessageStatusSchema>
export type ListContactMessagesQuery     = z.infer<typeof listContactMessagesQuerySchema>
