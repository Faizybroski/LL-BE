import { Request, Response, NextFunction } from 'express'
import { env } from '../lib/env'

export function timeoutMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setTimeout(env.REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        error: { message: 'Request timed out', code: 'REQUEST_TIMEOUT' },
      })
    }
  })
  next()
}
