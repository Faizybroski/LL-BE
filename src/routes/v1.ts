import { Router } from 'express'
import { authRouter } from '../modules/auth/auth.routes'
import { usersRouter } from '../modules/users/users.routes'
import { accountsRouter } from '../modules/accounts/accounts.routes'
import { shipmentsRouter } from '../modules/shipments/shipments.routes'
import { notesRouter } from '../modules/notes/notes.routes'
import { notificationsRouter } from '../modules/notifications/notifications.routes'
import { dashboardRouter } from '../modules/dashboard/dashboard.routes'
import { quotationsRouter } from '../modules/quotations/quotations.routes'
import { invoicesRouter } from '../modules/invoices/invoices.routes'
import { companyUsersRouter } from '../modules/company-users/company-users.routes'
import { locationsRouter } from '../modules/locations/locations.routes'
import { trackingRouter } from '../modules/tracking/tracking.routes'
import { statusesRouter } from '../modules/statuses/statuses.routes'
import { legalRouter } from '../modules/legal/legal.routes'
import { supportRouter } from '../modules/support/support.routes'

export const v1Router = Router()

v1Router.use('/auth',          authRouter)
v1Router.use('/users',         usersRouter)
v1Router.use('/accounts',      accountsRouter)
v1Router.use('/shipments',     shipmentsRouter)
v1Router.use('/notes',         notesRouter)
v1Router.use('/notifications', notificationsRouter)
v1Router.use('/dashboard',     dashboardRouter)
v1Router.use('/quotations',    quotationsRouter)
v1Router.use('/invoices',      invoicesRouter)
v1Router.use('/company/employees', companyUsersRouter)
v1Router.use('/locations',     locationsRouter)
v1Router.use('/tracking',      trackingRouter)
v1Router.use('/statuses',      statusesRouter)
v1Router.use('/legal',         legalRouter)
v1Router.use('/support',       supportRouter)
