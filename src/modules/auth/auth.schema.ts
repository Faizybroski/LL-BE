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
const optionalTrimmed = z.string().trim().max(200).optional().or(z.literal(''))

// Everything the sign-up form collects about the customer. Shared by email
// sign-up and Google sign-up so both require exactly the same information —
// Google only replaces the email + password fields.
const signupProfileFields = {
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  // 'corporate' = company account (creates an accounts row, role='corporate');
  // 'residential' = individual customer (no accounts row, role='residential').
  accountType: z.enum(['corporate', 'residential']).default('corporate'),
  company: z.string().min(2, 'Company name is required').max(200).optional(),
  phone: z.string().trim().min(7, 'Phone number is required').max(30),

  // ── Corporate company profile — captured at sign-up so the admin review
  //    and the customer's own company page have the full picture from day
  //    one (parity with GET /accounts/:id and /accounts/me). All optional
  //    at the schema level; the core ones are required for corporate below.
  businessType:         optionalTrimmed,
  industry:             optionalTrimmed,
  abn:                  optionalTrimmed,
  website:              z.string().trim().url('Enter a valid URL').max(200).optional().or(z.literal('')),
  addressLine1:         optionalTrimmed,
  addressCity:          optionalTrimmed,
  addressState:         optionalTrimmed,
  addressPostcode:      z.string().trim().max(20).optional().or(z.literal('')),
  addressCountry:       optionalTrimmed,
  billingEmail:         z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  accountsPayableEmail: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
}

const CORPORATE_REQUIRED: [keyof typeof signupProfileFields, string][] = [
  ['company',         'Company name is required'],
  ['businessType',    'Business type is required'],
  ['industry',        'Industry is required'],
  ['addressLine1',    'Business address is required'],
  ['addressCity',     'City is required'],
  ['addressState',    'State / province is required'],
  ['addressPostcode', 'Postcode is required'],
]

function requireCorporateFields(d: Record<string, unknown>, ctx: z.RefinementCtx) {
  if (d.accountType !== 'corporate') return
  for (const [field, message] of CORPORATE_REQUIRED) {
    if (!d[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] })
  }
}

export const registerSchema = z
  .object({
    email: z.string().email('Invalid email address').toLowerCase(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    ...signupProfileFields,
  })
  .superRefine(requireCorporateFields)

// ── POST /auth/google ──────────────────────────────────────────────────────────
// The Supabase access token from the browser's Google OAuth session.
export const googleAuthSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
})

// ── POST /auth/register/google ─────────────────────────────────────────────────
// Completes a Google sign-up: email comes from Google (bound to signupToken),
// there's no password — every other sign-up field is required as usual.
export const googleRegisterSchema = z
  .object({
    signupToken: z.string().min(1, 'Sign-up session is required'),
    ...signupProfileFields,
  })
  .superRefine(requireCorporateFields)

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

// ── POST /auth/mfa/verify ──────────────────────────────────────────────────────
// Confirms enrollment by proving the user's authenticator app is correctly synced.
export const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

// ── POST /auth/mfa/disable ─────────────────────────────────────────────────────
export const mfaDisableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

// ── POST /auth/mfa/challenge ────────────────────────────────────────────────────
// Second step of login when the account has MFA enabled.
export const mfaChallengeSchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

// ── Types ─────────────────────────────────────────────────────────────────────
export type LoginDto = z.infer<typeof loginSchema>
export type RefreshDto = z.infer<typeof refreshSchema>
export type LogoutDto = z.infer<typeof logoutSchema>
export type RegisterDto = z.infer<typeof registerSchema>
export type GoogleAuthDto = z.infer<typeof googleAuthSchema>
export type GoogleRegisterDto = z.infer<typeof googleRegisterSchema>
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>
export type MfaCodeDto = z.infer<typeof mfaCodeSchema>
export type MfaDisableDto = z.infer<typeof mfaDisableSchema>
export type MfaChallengeDto = z.infer<typeof mfaChallengeSchema>
