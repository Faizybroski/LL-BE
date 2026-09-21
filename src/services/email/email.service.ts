import { Resend } from 'resend'
import { env } from '../../lib/env'
import { logger } from '../../lib/logger'

// ── Outbound email dispatcher ─────────────────────────────────────────────────
// Transport: Resend. When RESEND_API_KEY is configured every call is delivered
// through Resend; when it is absent this stays a no-op that logs what *would*
// have been sent, so the full trigger/template pipeline still works in local
// dev and CI without a provider.
//
// Same convention as the module-local `notifyUser` helpers: callers invoke this
// fire-and-forget (`void sendEmail(...).catch(() => undefined)`) so a mail
// failure can never block or break the request that triggered it.

export type EmailMessage = {
  to:      string
  subject: string
  html:    string
  text:    string
}

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

if (!resend) {
  logger.warn('[email] RESEND_API_KEY not set — emails will be logged, not sent')
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!resend) {
    logger.info('[email] would send (no provider configured)', {
      to:      message.to,
      subject: message.subject,
    })
    logger.debug('[email] body', { to: message.to, text: message.text })
    return
  }

  const { error } = await resend.emails.send({
    from:    env.EMAIL_FROM,
    to:      message.to,
    subject: message.subject,
    html:    message.html,
    text:    message.text,
  })

  if (error) {
    logger.error('[email] send failed', { to: message.to, subject: message.subject, error })
    // Surface to the fire-and-forget `.catch()` at the call site.
    throw new Error(`Resend send failed: ${error.message}`)
  }

  logger.info('[email] sent', { to: message.to, subject: message.subject })
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
