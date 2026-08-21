import { z } from 'zod'

// Roles are DB-driven (admin_roles table) — CEO/VP/Manager/Assistant/Driver ship
// as seeded system rows, but the CEO can add arbitrary custom roles from the
// Roles & Permissions page, so this can't be a fixed string-literal union.
export type AdminRoleValue = string

// ── Update permission grant ───────────────────────────────────────────────────
export const adminRoleParamSchema = z.object({
  role: z.string().min(1),
  permissionKey: z.string().min(1),
})

export const updateRolePermissionSchema = z.object({
  granted: z.boolean(),
})

export type UpdateRolePermissionDto = z.infer<typeof updateRolePermissionSchema>

// ── Role CRUD ──────────────────────────────────────────────────────────────────
export const roleSlugRegex = /^[a-z][a-z0-9_]*$/

export const createAdminRoleSchema = z.object({
  slug:  z.string().min(2).max(40).regex(roleSlugRegex, 'Use lowercase letters, numbers and underscores only, starting with a letter'),
  label: z.string().min(1).max(50),
})

export const updateAdminRoleSchema = z.object({
  label: z.string().min(1).max(50),
})

export const adminRoleSlugParamSchema = z.object({
  role: z.string().min(1),
})

export type CreateAdminRoleDto = z.infer<typeof createAdminRoleSchema>
export type UpdateAdminRoleDto = z.infer<typeof updateAdminRoleSchema>
