import winston from 'winston'

const { combine, timestamp, errors, json, colorize, simple } = winston.format

const isDev = process.env.NODE_ENV !== 'production'

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    errors({ stack: true }),
    isDev ? combine(colorize(), simple()) : json(),
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
})

// HTTP request log helper
export function httpLog(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  requestId?: string,
): void {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
  logger.log(level, 'HTTP', { method, url, statusCode, durationMs, requestId })
}
