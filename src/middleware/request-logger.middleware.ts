import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { httpLog } from '../lib/logger'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string
      startTime: number
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID()
  req.startTime = Date.now()

  res.setHeader('X-Request-Id', req.requestId)

  res.on('finish', () => {
    httpLog(req.method, req.originalUrl, res.statusCode, Date.now() - req.startTime, req.requestId)
  })

  next()
}
