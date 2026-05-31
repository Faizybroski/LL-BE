import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'
import { errorResponse } from '../lib/response'
import { logger } from '../lib/logger'
import { env } from '../lib/env'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { stack: err.stack, url: req.url, method: req.method })
    }
    errorResponse(res, err.statusCode, err.message, err.code, err.details)
    return
  }

  // Supabase / Postgres unique constraint
  if ((err as NodeJS.ErrnoException).code === '23505') {
    errorResponse(res, 409, 'Resource already exists', 'CONFLICT')
    return
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack, url: req.url })

  errorResponse(
    res,
    500,
    env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    'INTERNAL_ERROR',
  )
}
