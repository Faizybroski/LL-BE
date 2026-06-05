import { z } from 'zod'

// ── System status slugs (mirror of shipments.SHIPMENT_STATUSES) ────────────────
// These are protected: they cannot be renamed, edited, or deleted.
export const SYSTEM_STATUS_SLUGS = [
  'pending',
  'confirmed',
  'assigned',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const

export type SystemStatusSlug = (typeof SYSTEM_STATUS_SLUGS)[number]

// ── Slug helper ───────────────────────────────────────────────────────────────
// Converts "Weather Hold" → "weather_hold"
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createStatusSchema = z.object({
  name:        z.string().min(1).max(100).transform((s) => s.trim()),
  description: z.string().max(500).optional(),
  color:       z.string().max(50).optional(),
})

export const updateStatusSchema = z.object({
  name:        z.string().min(1).max(100).transform((s) => s.trim()).optional(),
  description: z.string().max(500).optional().nullable(),
  color:       z.string().max(50).optional().nullable(),
  is_active:   z.boolean().optional(),
})

export const listStatusesSchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(200).default(100),
  search:    z.string().max(100).optional(),
  type:      z.enum(['system', 'custom']).optional(),
  isActive:  z.enum(['true', 'false']).optional(),
  sortBy:    z.enum(['name', 'type', 'is_active', 'created_at']).optional(),
  sortDir:   z.enum(['asc', 'desc']).optional(),
})

export const statusIdSchema = z.object({
  id: z.string().uuid('Invalid status ID'),
})

export type CreateStatusDto  = z.infer<typeof createStatusSchema>
export type UpdateStatusDto  = z.infer<typeof updateStatusSchema>
export type ListStatusesQuery = z.infer<typeof listStatusesSchema>
