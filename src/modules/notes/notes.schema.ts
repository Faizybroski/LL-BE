import { z } from 'zod'

export const NOTE_ENTITY_TYPES = ['shipment', 'carrier', 'assignment', 'shipper', 'account'] as const

export const createNoteSchema = z.object({
  entityType: z.enum(NOTE_ENTITY_TYPES),
  entityId: z.string().uuid('Invalid entity ID'),
  content: z.string().min(1, 'Note content is required').max(2000),
})

export const updateNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(2000),
})

export const listNotesQuerySchema = z.object({
  entityType: z.enum(NOTE_ENTITY_TYPES),
  entityId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateNoteDto = z.infer<typeof createNoteSchema>
export type UpdateNoteDto = z.infer<typeof updateNoteSchema>
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>
