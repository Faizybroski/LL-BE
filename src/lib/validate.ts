import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import { AppError } from './errors'

type Target = 'body' | 'query' | 'params'

/**
 * Middleware factory: validates req[target] against schema.
 * Replaces the raw value with the parsed (coerced/defaulted) value.
 */
export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target])
    if (!result.success) {
      const details = result.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
        const key = issue.path.join('.') || 'root'
        ;(acc[key] ??= []).push(issue.message)
        return acc
      }, {})
      return void next(AppError.badRequest('Validation failed', details))
    }
    // Write coerced/defaulted values back onto the request.
    // `req.query` is a getter-only on IncomingMessage's prototype, so direct
    // assignment throws. Shadow it on the instance with defineProperty instead.
    if (target === 'query') {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    } else {
      ;(req as unknown as Record<string, unknown>)[target] = result.data
    }
    next()
  }
}
