import { UserRole } from '../middleware/auth.middleware'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: UserRole
        accountId: string | null
      }
      requestId: string
      startTime: number
    }
  }
}

export {}
