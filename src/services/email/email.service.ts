import { logger } from '../../lib/logger'

// ── Outbound email dispatcher ─────────────────────────────────────────────────
// There is NO email provider wired yet — the transactional-email API will be
// provided later. Until then this is a no-op that logs what *would* have been
// sent, so the full trigger/template pipeline can be built and QA'd now and a
// real transport dropped in at the single `TODO` seam below without touching
// any call site.
//
// Same convention as the module-local `notifyUser` helpers: callers invoke
// this fire-and-forget (`void sendEmail(...).catch(() => undefined)`) so a
// mail failure can never block or break the request that triggered it.

export type EmailMessage = {
  to:      string
  subject: string
  html:    string
  text:    string
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  // TODO(email-provider): replace this block with the real transport call
  // (e.g. `await provider.send({ from: SUPPORT_FROM, ...message })`). Keep the
  // signature and the fire-and-forget contract identical.
  logger.info('[email] would send (no provider configured)', {
    to:      message.to,
    subject: message.subject,
    // body intentionally logged at debug only — keeps info logs readable
  })
  logger.debug('[email] body', { to: message.to, text: message.text })
}

// Convenience: dispatch the same message to many recipients, each its own
// fire-and-forget send. Never throws.
export function sendEmailToMany(recipients: string[], message: Omit<EmailMessage, 'to'>): void {
  for (const to of dedupe(recipients)) {
    void sendEmail({ ...message, to }).catch(() => undefined)
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((v) => !!v && v.includes('@')))]
}
