import { UserRole, CompanyRole, AdminRole } from '../middleware/auth.middleware'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id:          string
        email:       string
        role:        UserRole
        accountId:   string | null
        companyRole: CompanyRole
        adminRole:   AdminRole
        permissions: string[]
      }
      requestId: string
      startTime: number
    }
  }
}

export {}
