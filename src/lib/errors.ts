export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly details?: unknown
  public readonly isOperational: boolean

  constructor(statusCode: number, message: string, code: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, message, 'BAD_REQUEST', details)
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(401, message, 'UNAUTHORIZED')
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, message, 'FORBIDDEN')
  }

  static notFound(resource: string): AppError {
    return new AppError(404, `${resource} not found`, 'NOT_FOUND')
  }

  static conflict(message: string): AppError {
    return new AppError(409, message, 'CONFLICT')
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, message, 'UNPROCESSABLE_ENTITY', details)
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(500, message, 'INTERNAL_ERROR')
  }
}
