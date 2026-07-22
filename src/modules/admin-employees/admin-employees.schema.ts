import { z } from 'zod'

const ADMIN_ROLES = ['ceo', 'vp', 'manager', 'assistant'] as const

// ── Create Employee ───────────────────────────────────────────────────────────
export const createAdminEmployeeSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().min(7).max(30).optional(),
  adminRole: z.enum(ADMIN_ROLES),
})

// ── Update Employee ───────────────────────────────────────────────────────────
export const updateAdminEmployeeSchema = z.object({
  fullName:  z.string().min(2).max(100).optional(),
  phone:     z.string().min(7).max(30).optional(),
  isActive:  z.boolean().optional(),
  adminRole: z.enum(ADMIN_ROLES).optional(),
})

// ── List Employees ────────────────────────────────────────────────────────────
export const listAdminEmployeesSchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ── Types ─────────────────────────────────────────────────────────────────────
export type CreateAdminEmployeeDto = z.infer<typeof createAdminEmployeeSchema>
export type UpdateAdminEmployeeDto = z.infer<typeof updateAdminEmployeeSchema>
export type ListAdminEmployeesQuery = z.infer<typeof listAdminEmployeesSchema>
