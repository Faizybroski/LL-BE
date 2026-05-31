import { Response } from 'express'

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface SuccessBody<T> {
  success: true
  data: T
  message?: string
  meta?: PaginationMeta
}

interface ErrorBody {
  success: false
  error: {
    message: string
    code: string
    details?: unknown
  }
}

export function ok<T>(res: Response, data: T, message?: string): void {
  const body: SuccessBody<T> = { success: true, data }
  if (message) body.message = message
  res.status(200).json(body)
}

export function created<T>(res: Response, data: T, message?: string): void {
  const body: SuccessBody<T> = { success: true, data }
  if (message) body.message = message
  res.status(201).json(body)
}

export function paginated<T>(res: Response, data: T[], meta: PaginationMeta): void {
  const body: SuccessBody<T[]> = { success: true, data, meta }
  res.status(200).json(body)
}

export function noContent(res: Response): void {
  res.status(204).send()
}

export function errorResponse(
  res: Response,
  statusCode: number,
  message: string,
  code: string,
  details?: unknown,
): void {
  const body: ErrorBody = { success: false, error: { message, code } }
  if (details !== undefined) body.error.details = details
  res.status(statusCode).json(body)
}

export function parsePagination(
  query: Record<string, unknown>,
  defaults = { page: 1, limit: 20 },
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(query.page) || defaults.page)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || defaults.limit))
  return { page, limit, offset: (page - 1) * limit }
}
