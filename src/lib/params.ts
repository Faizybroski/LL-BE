import { Request } from 'express'

/** Safely extract a route param as a plain string (Express 5 params type is string | string[]). */
export function param(req: Request, name: string): string {
  const v = req.params[name]
  return Array.isArray(v) ? v[0]! : (v ?? '')
}
