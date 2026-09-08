// Shared shell for every transactional email body. Plain, table-free, inline
// styles only — safe for the widest set of mail clients and trivial for a real
// provider to send as-is once the transport is wired.

const BRAND = 'Logical Links'
const SIGN_OFF_LINES = ['Kind regards,', 'Customer Support Team', BRAND]

export type RenderedEmail = {
  subject: string
  html:    string
  text:    string
}

/**
 * Build a full email from a heading + ordered paragraphs. The standard
 * "Kind regards / Customer Support Team / Logical Links" sign-off is appended
 * automatically — do not include it in `paragraphs`. Pass `signOff` to use a
 * different closing (e.g. the account emails close with "Regards, / Logical Links").
 */
export function renderEmail(opts: {
  subject:    string
  heading:    string
  paragraphs: string[]
  signOff?:   string[]
}): RenderedEmail {
  const { subject, heading, paragraphs } = opts
  const signOffLines = opts.signOff ?? SIGN_OFF_LINES

  const text = [
    heading,
    '',
    ...paragraphs,
    '',
    ...signOffLines,
  ].join('\n')

  const paragraphHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(p)}</p>`)
    .join('\n')

  const signOffHtml = signOffLines
    .map((line) => `<div style="font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(line)}</div>`)
    .join('\n')

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 20px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(heading)}</h1>
      ${paragraphHtml}
      <div style="margin-top:24px;">${signOffHtml}</div>
    </div>
  </body>
</html>`

  return { subject, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
