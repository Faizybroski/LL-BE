import { z } from 'zod'

export const CANADIAN_PROVINCES = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Nova Scotia',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Northwest Territories',
  'Nunavut',
  'Yukon',
] as const

export type CanadianProvince = (typeof CANADIAN_PROVINCES)[number]

export const createLocationSchema = z.object({
  city:     z.string().min(1).max(100).transform((s) => s.trim()),
  province: z.string().min(1).max(100).transform((s) => s.trim()),
})

export const updateLocationSchema = createLocationSchema.partial()

export const listLocationsSchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(200).default(50),
  search:   z.string().max(100).optional(),
  province: z.string().optional(),
  sortBy:   z.enum(['city', 'province', 'created_at']).optional(),
  sortDir:  z.enum(['asc', 'desc']).optional(),
})

export const locationIdSchema = z.object({
  id: z.string().uuid('Invalid location ID'),
})

export type CreateLocationDto = z.infer<typeof createLocationSchema>
export type UpdateLocationDto = z.infer<typeof updateLocationSchema>
export type ListLocationsQuery = z.infer<typeof listLocationsSchema>
