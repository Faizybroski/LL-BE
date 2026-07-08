import { z } from 'zod'

export const SUPPORT_CASE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const

export const createCaseSchema = z.object({
  subject:     z.string().min(1, 'Subject is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
})

export const updateCaseStatusSchema = z.object({
  status: z.enum(SUPPORT_CASE_STATUSES),
})

export const updateCaseSchema = z
  .object({
    subject:     z.string().min(1, 'Subject is required').max(200).optional(),
    description: z.string().min(1, 'Description is required').max(5000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
})

export const listCasesQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SUPPORT_CASE_STATUSES).optional(),
  search: z.string().max(200).optional(),
})

export const attachmentUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024).optional(),
})

export const confirmAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  filePath: z.string().min(1),
  fileSize: z.number().int().min(0).optional(),
})

export type CreateCaseDto            = z.infer<typeof createCaseSchema>
export type UpdateCaseStatusDto      = z.infer<typeof updateCaseStatusSchema>
export type UpdateCaseDto            = z.infer<typeof updateCaseSchema>
export type CreateCommentDto         = z.infer<typeof createCommentSchema>
export type ListCasesQuery           = z.infer<typeof listCasesQuerySchema>
export type AttachmentUploadUrlDto   = z.infer<typeof attachmentUploadUrlSchema>
export type ConfirmAttachmentDto     = z.infer<typeof confirmAttachmentSchema>
