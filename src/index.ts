import './lib/env' // validate env at startup before anything else
import { createApp } from './app'
import { env } from './lib/env'
import { logger } from './lib/logger'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`Logical Links CMS backend started`, {
    port: env.PORT,
    env: env.NODE_ENV,
    url: `http://localhost:${env.PORT}`,
  })
})

// ── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down gracefully`)
  server.close((err) => {
    if (err) {
      logger.error('Error during shutdown', { error: err.message })
      process.exit(1)
    }
    logger.info('Server closed')
    process.exit(0)
  })

  // Force-exit if shutdown takes longer than 10 s
  setTimeout(() => {
    logger.error('Graceful shutdown timeout — forcing exit')
    process.exit(1)
  }, 10_000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason })
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { message: err.message, stack: err.stack })
  process.exit(1)
})

export default app
