import { z } from 'zod'

export const ADMIN_ROLES = ['ceo', 'vp', 'manager', 'assistant'] as const
export type AdminRoleValue = (typeof ADMIN_ROLES)[number]

// ── Update permission grant ───────────────────────────────────────────────────
export const adminRoleParamSchema = z.object({
  role: z.enum(ADMIN_ROLES),
  permissionKey: z.string().min(1),
})

export const updateRolePermissionSchema = z.object({
  granted: z.boolean(),
})

export type UpdateRolePermissionDto = z.infer<typeof updateRolePermissionSchema>
