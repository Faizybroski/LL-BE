import { z } from 'zod'

// ── POST /auth/login ───────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  // Optional device identifier for session management UI
  deviceInfo: z.string().max(200).optional(),
})

// ── POST /auth/refresh ─────────────────────────────────────────────────────────
export const refreshSchema = z.object({
  // base64url-encoded 48-byte token, ~64 characters
  refreshToken: z
    .string()
    .min(60, 'Invalid refresh token')
    .max(100, 'Invalid refresh token'),
})

// ── POST /auth/logout ──────────────────────────────────────────────────────────
export const logoutSchema = z.object({
  refreshToken: z.string().min(60).max(100).optional(),
  // If true, revoke ALL sessions for the user (logout from all devices)
  allDevices: z.boolean().default(false),
})

// ── POST /auth/register ────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  company: z.string().min(2, 'Company name is required').max(200),
  phone: z.string().min(7).max(30).optional(),
})

// ── POST /auth/change-password ─────────────────────────────────────────────────
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

// ── Types ─────────────────────────────────────────────────────────────────────
export type LoginDto = z.infer<typeof loginSchema>
export type RefreshDto = z.infer<typeof refreshSchema>
export type LogoutDto = z.infer<typeof logoutSchema>
export type RegisterDto = z.infer<typeof registerSchema>
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>
