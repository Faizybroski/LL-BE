import { z } from 'zod'

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  // YYYY-MM-DD — used only for the residential Rewards birthday bonus.
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
})

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['admin', 'corporate', 'residential']).optional(),
  search: z.string().optional(),
})

export const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'corporate']),
})

export const approveUserSchema = z.object({
  isApproved: z.boolean(),
})

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>
export type ListUsersQuery   = z.infer<typeof listUsersQuerySchema>
export type UpdateUserRoleDto = z.infer<typeof updateUserRoleSchema>
export type ApproveUserDto   = z.infer<typeof approveUserSchema>
