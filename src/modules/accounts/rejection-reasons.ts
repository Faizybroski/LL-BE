import type { RejectionReason } from './accounts.schema'

// Fixed rejection reasons the Admin team chooses from. Each carries:
//   - label:        human text stored on accounts.rejection_reason and shown
//                   to other admins on the review decision + activity feed.
//   - internalNote: the canned internal note stored on accounts.review_note.
//                   Not editable — for 'other' the admin's typed note is used
//                   instead (the schema makes it required for that reason).
//   - emailBody:    which customer email body to send (see account.templates.ts).
//                   Several reasons deliberately share a body.
export type RejectionEmailBody = 'information' | 'coverage' | 'requirements' | 'generic'

export const REJECTION_REASON_META: Record<
  RejectionReason,
  { label: string; internalNote: string; emailBody: RejectionEmailBody }
> = {
  incomplete_information: {
    label: 'Incomplete / Insufficient Information',
    internalNote:
      "Information is missing, incomplete, or there isn't enough information to approve the account.",
    emailBody: 'information',
  },
  business_verification_failed: {
    label: 'Business Verification Unsuccessful',
    internalNote: 'The business information could not be verified.',
    emailBody: 'information',
  },
  services_not_available: {
    label: 'Services or Coverage Not Available',
    internalNote:
      "The requested services, delivery area, or requirements aren't currently supported.",
    emailBody: 'coverage',
  },
  requirements_not_met: {
    label: 'Account Requirements Not Met',
    internalNote: "The business doesn't meet the criteria for a corporate account.",
    emailBody: 'requirements',
  },
  commercial_terms_unsuitable: {
    label: 'Commercial Terms Not Suitable',
    internalNote:
      "Requested pricing, payment terms, volume, or other commercial requirements can't be accommodated.",
    emailBody: 'generic',
  },
  other: {
    label: 'Other',
    internalNote:
      "Anything unusual that doesn't fit the standard reasons. Admin must provide a note.",
    emailBody: 'generic',
  },
}
