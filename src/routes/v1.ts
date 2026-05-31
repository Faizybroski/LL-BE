import { Router } from 'express'
import { authRouter } from '../modules/auth/auth.routes'
import { usersRouter } from '../modules/users/users.routes'
import { accountsRouter } from '../modules/accounts/accounts.routes'
import { shipmentsRouter } from '../modules/shipments/shipments.routes'
import { notesRouter } from '../modules/notes/notes.routes'
import { notificationsRouter } from '../modules/notifications/notifications.routes'
import { dashboardRouter } from '../modules/dashboard/dashboard.routes'

export const v1Router = Router()

v1Router.use('/auth',          authRouter)
v1Router.use('/users',         usersRouter)
v1Router.use('/accounts',      accountsRouter)
v1Router.use('/shipments',     shipmentsRouter)
v1Router.use('/notes',         notesRouter)
v1Router.use('/notifications', notificationsRouter)
v1Router.use('/dashboard',     dashboardRouter)
