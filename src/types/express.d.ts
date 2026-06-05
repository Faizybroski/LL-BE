import { UserRole, CompanyRole } from '../middleware/auth.middleware'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id:          string
        email:       string
        role:        UserRole
        accountId:   string | null
        companyRole: CompanyRole
      }
      requestId: string
      startTime: number
    }
  }
}

export {}
