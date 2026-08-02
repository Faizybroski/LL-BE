import '../src/lib/env'
import { createApp } from '../src/app'
import { registerProcessDiagnostics } from '../src/lib/process-diagnostics'

// DIAGNOSTIC ONLY — this entrypoint (the Vercel serverless function) had no
// unhandledRejection/uncaughtException/warning listeners at all before this
// change. Purely additive logging, no process.exit, no behavior change to
// request handling — needed because this is the production entrypoint where
// the intermittent 500s are actually occurring.
registerProcessDiagnostics('vercel-api')

export default createApp()
