import { renderEmail, type RenderedEmail } from './layout'
import type { RejectionEmailBody } from '../../../modules/accounts/rejection-reasons'

// Customer-facing emails for the corporate account application decision.
// Copy is taken verbatim from the client's spec; these close with
// "Regards, / Logical Links" rather than the default support-team sign-off.
//
// No email provider is wired yet (see email.service.ts) — these are rendered
// and logged only until the transport lands.

const SIGN_OFF = ['Regards,', 'Logical Links']
const DECISION_SUBJECT = 'Your Logical Links Corporate Account Application Update'

// "Hello Jane," / "Hello," when we don't have a name.
const greeting = (name: string) => (name.trim() ? `Hello ${name.trim()},` : 'Hello,')

// Incomplete / Insufficient Information · Business Verification Unsuccessful
function informationRejectionEmail(name: string): RenderedEmail {
  return renderEmail({
    subject: DECISION_SUBJECT,
    heading: DECISION_SUBJECT,
    signOff: SIGN_OFF,
    paragraphs: [
      greeting(name),
      'Thank you for submitting your corporate account application with Logical Links.',
      'After reviewing your application, we were unable to approve the corporate account at this time because additional information was required or we were unable to verify the business information provided.',
      'You may submit a new application with updated or additional information for review.',
      'Thank you for your interest in Logical Links.',
    ],
  })
}

// Services or Coverage Not Available
function coverageRejectionEmail(name: string): RenderedEmail {
  return renderEmail({
    subject: DECISION_SUBJECT,
    heading: DECISION_SUBJECT,
    signOff: SIGN_OFF,
    paragraphs: [
      greeting(name),
      'Thank you for your interest in establishing a corporate account with Logical Links.',
      'We are unable to approve your application at this time because the requested services, delivery requirements, or service area are not currently supported.',
      'We appreciate your interest in Logical Links and hope to have an opportunity to work with you in the future.',
    ],
  })
}

// Account Requirements Not Met
function requirementsRejectionEmail(name: string): RenderedEmail {
  return renderEmail({
    subject: DECISION_SUBJECT,
    heading: DECISION_SUBJECT,
    signOff: SIGN_OFF,
    paragraphs: [
      greeting(name),
      'Thank you for submitting your corporate account application with Logical Links.',
      'After reviewing your application, we determined that the business does not currently meet the requirements for a corporate account.',
      'You may submit a new application in the future if your business circumstances or requirements change.',
      'Thank you for your interest in Logical Links.',
    ],
  })
}

// Commercial Terms Not Suitable · Other
function genericRejectionEmail(name: string): RenderedEmail {
  return renderEmail({
    subject: DECISION_SUBJECT,
    heading: DECISION_SUBJECT,
    signOff: SIGN_OFF,
    paragraphs: [
      greeting(name),
      'Thank you for your interest in establishing a corporate account with Logical Links.',
      'After completing our review, we are unable to approve the corporate account application at this time.',
      'We appreciate your interest in Logical Links and thank you for your understanding.',
    ],
  })
}

const REJECTION_EMAIL_BODIES: Record<RejectionEmailBody, (name: string) => RenderedEmail> = {
  information:  informationRejectionEmail,
  coverage:     coverageRejectionEmail,
  requirements: requirementsRejectionEmail,
  generic:      genericRejectionEmail,
}

export function rejectionEmail(body: RejectionEmailBody, customerName: string): RenderedEmail {
  return REJECTION_EMAIL_BODIES[body](customerName)
}

// Sent when a corporate application is approved — i.e. the account first reaches
// a pipeline stage that grants portal access (onboarding / active).
export function approvalEmail(customerName: string): RenderedEmail {
  return renderEmail({
    subject: 'Your Logical Links Corporate Account Has Been Approved',
    heading: 'Your Logical Links Corporate Account Has Been Approved',
    signOff: SIGN_OFF,
    paragraphs: [
      greeting(customerName),
      'Good news! Your corporate account application with Logical Links has been approved.',
      'Your corporate account is now active, and you can sign in to your customer portal to manage your deliveries, view account information, and access your available services.',
      'We look forward to working with you.',
    ],
  })
}
