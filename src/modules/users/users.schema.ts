import { z } from 'zod'

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
})

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['admin', 'shipper']).optional(),
  search: z.string().optional(),
})

export const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'shipper']),
})

export const approveUserSchema = z.object({
  isApproved: z.boolean(),
})

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>
export type ListUsersQuery   = z.infer<typeof listUsersQuerySchema>
export type UpdateUserRoleDto = z.infer<typeof updateUserRoleSchema>
export type ApproveUserDto   = z.infer<typeof approveUserSchema>
