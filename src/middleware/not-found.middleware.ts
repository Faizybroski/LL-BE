import { Request, Response } from 'express'
import { errorResponse } from '../lib/response'

export function notFoundMiddleware(req: Request, res: Response): void {
  errorResponse(res, 404, `Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND')
}
