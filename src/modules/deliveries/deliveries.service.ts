import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import type { UserRole } from '../../middleware/auth.middleware'
import * as deliveriesRepo from './deliveries.repository'
import * as notificationsService from '../notifications/notifications.service'
import * as rewardsCreditService from '../rewards-credit/rewards-credit.service'
import { sendEmail } from '../../services/email/email.service'
import {
  bookingReceivedEmail,
  STATUS_EMAIL_TEMPLATES,
  type EmailAudience,
} from '../../services/email/templates/delivery.templates'
import type { RenderedEmail } from '../../services/email/templates/layout'
import {
  DELIVERY_STATUSES,
  STATUS_TRANSITIONS,
  type DeliveryStatus,
  type CreateDeliveryDto,
  type UpdateDeliveryDto,
  type UpdateDeliveryStatusDto,
  type UpdateEtaDto,
  type DeleteDeliveryDto,
  type ArchiveDeliveryDto,
  type AssignEmployeesDto,
  type ListDeliveriesQuery,
} from './deliveries.schema'

// ── Helpers ───────────────────────────────────────────────────────────────────

function cast<T>(record: unknown): T {
  return record as T
}

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(
  userId:   string,
  type:     'shipment_created' | 'shipment_updated' | 'shipment_confirmed' | 'shipment_assigned' | 'shipment_picked_up' | 'shipment_in_transit' | 'shipment_out_for_delivery' | 'shipment_delivered' | 'shipment_cancelled' | 'shipment_eta_updated' | 'shipment_deleted',
  title:    string,
  body:     string,
  entityId: string,
): void {
  void notificationsService
    .createNotification({ userId, type, title, body, entityType: 'delivery', entityId })
    .catch(() => undefined)
}

type DeliveryRow = Record<string, unknown>

type NotifyType = Parameters<typeof notifyUser>[1]

// ── Stakeholder fan-out ───────────────────────────────────────────────────────
// One place that resolves *everyone* who should hear about a delivery event and
// sends each of them an in-app notification. Previously each call site only
// notified `delivery.created_by`, so when an admin operates a delivery on a
// customer's behalf (created_by = the admin) the residential customer
// (customer_id) or the corporate company (account_id) received nothing — the
// "QA shows no notification going to the customer" gap.
//
// Fire-and-forget: callers `void notifyDeliveryStakeholders(...)`.
async function notifyDeliveryStakeholders(
  delivery: DeliveryRow,
  opts: {
    type:          NotifyType
    actorId:       string
    customerTitle: string
    customerBody:  string
    // Copy for assigned Logical Links staff (driver/dispatcher). Falls back to
    // the customer copy when omitted.
    staffTitle?:   string
    staffBody?:    string
  },
): Promise<void> {
  const deliveryId = (delivery.shipment_id as string | undefined) ?? (delivery.id as string)
  if (!deliveryId) return

  const customerRecipients = new Set<string>()

  const createdBy = delivery.created_by as string | undefined
  if (createdBy) customerRecipients.add(createdBy)

  const customerId = delivery.customer_id as string | undefined
  if (customerId) customerRecipients.add(customerId)

  const accountId = delivery.account_id as string | undefined
  if (accountId) {
    const { data: companyAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('company_role', 'company_admin')
    for (const admin of companyAdmins ?? []) customerRecipients.add(admin.id as string)
  }

  customerRecipients.delete(opts.actorId)
  for (const userId of customerRecipients) {
    notifyUser(userId, opts.type, opts.customerTitle, opts.customerBody, deliveryId)
  }

  // Assigned staff — embedded on every findById() row as `assignments`.
  const assignees = (delivery.assignments as Array<{ employee_id: string }> | undefined) ?? []
  const staffTitle = opts.staffTitle ?? opts.customerTitle
  const staffBody  = opts.staffBody  ?? opts.customerBody
  for (const { employee_id } of assignees) {
    if (employee_id !== opts.actorId && !customerRecipients.has(employee_id)) {
      notifyUser(employee_id, opts.type, staffTitle, staffBody, deliveryId)
    }
  }
}

// Every delivery lifecycle email also goes to the company inbox as a BCC-style
// copy, since nothing else surfaces bookings there.
const COMPANY_NOTIFICATION_EMAIL = 'logicallinkscorp@gmail.com'

// ── Customer email fan-out ────────────────────────────────────────────────────
// Resolves the customer-side email recipients for a delivery and sends each the
// rendered template. No email provider is wired yet (see email.service.ts) —
// this drives the no-op dispatcher today and a real transport later without
// changing call sites. Fire-and-forget.
function sendDeliveryLifecycleEmail(
  delivery: DeliveryRow,
  build: (args: { loadNumber: string; audience: EmailAudience }) => RenderedEmail,
): void {
  void (async () => {
    const loadNumber = (delivery.load_number as string | undefined)
      ?? (delivery.shipment_id as string | undefined)
      ?? (delivery.id as string)
    const recipients = await resolveDeliveryEmailRecipients(delivery)
    for (const { email, audience } of recipients) {
      const msg = build({ loadNumber, audience })
      void sendEmail({ to: email, subject: msg.subject, html: msg.html, text: msg.text }).catch(() => undefined)
    }

    const companyMsg = build({ loadNumber, audience: 'corporate' })
    void sendEmail({
      to:      COMPANY_NOTIFICATION_EMAIL,
      subject: companyMsg.subject,
      html:    companyMsg.html,
      text:    companyMsg.text,
    }).catch(() => undefined)
  })().catch(() => undefined)
}

async function resolveDeliveryEmailRecipients(
  delivery: DeliveryRow,
): Promise<{ email: string; audience: EmailAudience }[]> {
  const out: { email: string; audience: EmailAudience }[] = []
  const seen = new Set<string>()

  const push = (email: string | null | undefined, audience: EmailAudience) => {
    if (email && !seen.has(email)) {
      seen.add(email)
      out.push({ email, audience })
    }
  }

  const lookupEmail = async (userId: string): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId)
      return data.user?.email ?? null
    } catch {
      return null
    }
  }

  const customerId = delivery.customer_id as string | undefined
  if (customerId) push(await lookupEmail(customerId), 'residential')

  const accountId = delivery.account_id as string | undefined
  if (accountId) {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('company_role', 'company_admin')
    for (const admin of admins ?? []) push(await lookupEmail(admin.id as string), 'corporate')
  }

  // Fallback: a delivery with neither a residential customer nor a company
  // attached, created by a non-admin — notify the creator directly.
  if (out.length === 0) {
    const createdBy     = delivery.created_by as string | undefined
    const createdByRole = delivery.created_by_role as string | undefined
    if (createdBy && createdByRole && createdByRole !== 'admin') {
      push(await lookupEmail(createdBy), createdByRole === 'residential' ? 'residential' : 'corporate')
    }
  }

  return out
}

const TERMINAL_STATUSES = new Set<string>(['delivered', 'cancelled'])

function assertTransition(current: string, next: string): void {
  // Terminal system statuses are absolute — no transition out of them
  if (TERMINAL_STATUSES.has(current)) {
    throw AppError.unprocessable(
      `Cannot change status: '${current}' is a terminal state`,
    )
  }

  // Both current and next are system statuses → enforce the state machine
  const isCurrentSystem = DELIVERY_STATUSES.includes(current as DeliveryStatus)
  const isNextSystem    = DELIVERY_STATUSES.includes(next as DeliveryStatus)

  if (isCurrentSystem && isNextSystem) {
    if (!STATUS_TRANSITIONS[current as DeliveryStatus]?.includes(next as DeliveryStatus)) {
      throw AppError.unprocessable(
        `Cannot transition from '${current}' to '${next}'. ` +
        `Allowed: ${STATUS_TRANSITIONS[current as DeliveryStatus]?.join(', ') || 'none'}`,
      )
    }
  }
  // Current or next is a custom status → allow (informational update)
}

// ── Access guard ──────────────────────────────────────────────────────────────
// Admins: full access.
// Corporate customers: deliveries belonging to their account OR created by them.
// Corporate customers have no employees of their own — one login per account.
async function requireDeliveryAccess(
  id:          string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
  ownScoped    = false,
): Promise<DeliveryRow> {
  const { data, error } = await deliveriesRepo.findById(id)
  if (error || !data) throw AppError.notFound('Delivery')

  const delivery = cast<DeliveryRow>(data)

  if (!isAdmin) {
    if (isResidential) {
      // Residential customers can only access deliveries linked directly to them
      if (delivery.customer_id !== userId) {
        throw AppError.forbidden('You do not have access to this delivery')
      }
    } else {
      // Company admins: must match on account or be the creator
      const matchesAccount = accountId && delivery.account_id === accountId
      const isCreator      = userId    && delivery.created_by  === userId
      if (!matchesAccount && !isCreator) {
        throw AppError.forbidden('You do not have access to this delivery')
      }
    }
  } else if (ownScoped) {
    // Own/assigned-only scope (admin_role_permissions.scope = 'own' on
    // 'deliveries.view') — this staff member may only access deliveries
    // they're assigned to via delivery_assignments (already embedded on the
    // fetched delivery record as `assignments`).
    const assignments = (delivery.assignments as Array<{ employee_id: string }> | undefined) ?? []
    if (!assignments.some((a) => a.employee_id === userId)) {
      throw AppError.forbidden('You do not have access to this delivery')
    }
  }

  return delivery
}

// ── List ──────────────────────────────────────────────────────────────────────
export async function listDeliveries(
  query:       ListDeliveriesQuery,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
  ownScoped    = false,
) {
  const { data, count, error } = await deliveriesRepo.findAll(query, accountId, isAdmin, userId, companyRole, isResidential, ownScoped)
  if (error) throw AppError.internal('Failed to fetch deliveries', error)
  return { deliveries: data ?? [], total: count ?? 0 }
}

// ── Get one ───────────────────────────────────────────────────────────────────
export async function getDelivery(
  id:          string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
  ownScoped    = false,
) {
  const delivery = await requireDeliveryAccess(id, isAdmin, accountId, userId, companyRole, isResidential, ownScoped)
  const { data: history } = await deliveriesRepo.findStatusHistory(id)
  return { ...delivery, statusHistory: history ?? [] }
}

// ── Create ────────────────────────────────────────────────────────────────────
export async function createDelivery(
  dto:         CreateDeliveryDto,
  createdBy:   string,
  creatorRole: UserRole,
) {
  let resolvedAccountId: string | null = null
  let resolvedCustomerId: string | null = null

  if (creatorRole === 'corporate') {
    // Shipping company creates delivery → auto-assign to their account
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', createdBy)
      .single()
    if (profileErr || !profile) throw AppError.internal('Failed to resolve your company account', profileErr)
    resolvedAccountId = profile.account_id ?? null
  } else if (dto.customerId) {
    if (dto.accountId) throw AppError.badRequest('A delivery cannot be linked to both a shipping company and a residential customer')
    // Admin links this delivery directly to a residential customer
    const { data: customer, error: customerErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', dto.customerId)
      .single()
    if (customerErr || !customer) throw AppError.notFound('Residential customer')
    if (customer.role !== 'residential') throw AppError.unprocessable('Target profile is not a residential customer')
    resolvedCustomerId = customer.id
  } else if (dto.accountId) {
    // Admin pre-assigns to a shipping company
    const { data: account, error: accountErr } = await supabase
      .from('accounts')
      .select('account_id, is_active')
      .eq('account_id', dto.accountId)
      .single()
    if (accountErr || !account) throw AppError.notFound('Shipping company')
    if (!account.is_active) throw AppError.unprocessable('Cannot assign to an inactive shipping company')
    resolvedAccountId = account.account_id
  }

  const { data, error } = await deliveriesRepo.create({
    shipment_type:    dto.deliveryType,
    service_type:     dto.serviceType ?? null,
    service_level:    dto.serviceLevel ?? null,
    package_type:     dto.packageType ?? null,
    preferred_delivery_date: dto.preferredDeliveryDate ?? null,
    account_id:       resolvedAccountId,
    customer_id:      resolvedCustomerId,
    created_by_role:  creatorRole,

    origin_address:  dto.originAddress,
    origin_city:     dto.originCity,
    origin_state:    dto.originState,
    origin_postcode: dto.originPostcode,
    origin_country:  dto.originCountry,

    destination_address:  dto.destinationAddress,
    destination_city:     dto.destinationCity,
    destination_state:    dto.destinationState,
    destination_postcode: dto.destinationPostcode,
    destination_country:  dto.destinationCountry,

    cargo_description:      dto.cargoDescription,
    weight_kg:              dto.weightKg ?? null,
    volume_m3:              dto.volumeM3 ?? null,
    pieces:                 dto.pieces ?? null,
    is_dangerous_goods:     dto.isDangerousGoods,
    requires_refrigeration: dto.requiresRefrigeration,

    estimated_pickup_date:   dto.estimatedPickupDate ?? null,
    estimated_delivery_date: dto.estimatedDeliveryDate ?? null,

    quoted_price: dto.quotedPrice ?? null,
    currency:     dto.currency,

    special_instructions: dto.specialInstructions ?? null,
    // reference_number intentionally omitted — auto-generated by the DB trigger (LLC-####).

    status:     'pending' as DeliveryStatus,
    created_by: createdBy,
  })

  if (error) throw AppError.internal('Failed to create delivery', error)

  const createdLoadNumber = (data.load_number as string | undefined) ?? (data.shipment_id as string)

  // "Booking Received" — reaches the submitter, the residential customer
  // (customer_id) and the corporate company (account_id), whichever apply.
  void notifyDeliveryStakeholders(data as DeliveryRow, {
    type:          'shipment_created',
    actorId:       createdBy,
    customerTitle: 'Booking received',
    customerBody:  `Your booking ${createdLoadNumber} has been received.`,
  })
  // Email: Booking Received (per the client's event matrix).
  sendDeliveryLifecycleEmail(data as DeliveryRow, bookingReceivedEmail)

  const loadNumber = (data as DeliveryRow).load_number as string | undefined
  void notificationsService.notifyAllAdmins(
    'shipment_created',
    'New delivery created',
    `Delivery ${loadNumber ?? (data as DeliveryRow).shipment_id} was created.`,
    'delivery',
    (data as DeliveryRow).shipment_id as string,
    createdBy,
  )

  return data
}

// ── Update ────────────────────────────────────────────────────────────────────
export async function updateDelivery(
  id:          string,
  dto:         UpdateDeliveryDto,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  ownScoped    = false,
) {
  await requireDeliveryAccess(id, isAdmin, accountId, userId, companyRole, false, ownScoped)

  // Corporates cannot touch financial or actual-event fields.
  if (!isAdmin) {
    const adminOnlyFields: (keyof UpdateDeliveryDto)[] = [
      'quotedPrice', 'confirmedPrice', 'currency',
      'actualPickupDate', 'actualDeliveryDate',
    ]
    for (const field of adminOnlyFields) {
      if (dto[field] !== undefined) {
        throw AppError.forbidden(`Only admins can update '${field}'`)
      }
    }
  }

  const updates: Record<string, unknown> = {}

  if (dto.originAddress   !== undefined) updates.origin_address   = dto.originAddress
  if (dto.originCity      !== undefined) updates.origin_city      = dto.originCity
  if (dto.originState     !== undefined) updates.origin_state     = dto.originState
  if (dto.originPostcode  !== undefined) updates.origin_postcode  = dto.originPostcode
  if (dto.originCountry   !== undefined) updates.origin_country   = dto.originCountry

  if (dto.destinationAddress  !== undefined) updates.destination_address  = dto.destinationAddress
  if (dto.destinationCity     !== undefined) updates.destination_city     = dto.destinationCity
  if (dto.destinationState    !== undefined) updates.destination_state    = dto.destinationState
  if (dto.destinationPostcode !== undefined) updates.destination_postcode = dto.destinationPostcode
  if (dto.destinationCountry  !== undefined) updates.destination_country  = dto.destinationCountry

  if (dto.cargoDescription      !== undefined) updates.cargo_description      = dto.cargoDescription
  if (dto.weightKg              !== undefined) updates.weight_kg              = dto.weightKg
  if (dto.volumeM3              !== undefined) updates.volume_m3              = dto.volumeM3
  if (dto.pieces                !== undefined) updates.pieces                 = dto.pieces
  if (dto.isDangerousGoods      !== undefined) updates.is_dangerous_goods     = dto.isDangerousGoods
  if (dto.requiresRefrigeration !== undefined) updates.requires_refrigeration = dto.requiresRefrigeration

  if (dto.estimatedPickupDate   !== undefined) updates.estimated_pickup_date   = dto.estimatedPickupDate
  if (dto.estimatedDeliveryDate !== undefined) updates.estimated_delivery_date = dto.estimatedDeliveryDate
  if (dto.actualPickupDate      !== undefined) updates.actual_pickup_date      = dto.actualPickupDate
  if (dto.actualDeliveryDate    !== undefined) updates.actual_delivery_date    = dto.actualDeliveryDate

  if (dto.quotedPrice    !== undefined) updates.quoted_price    = dto.quotedPrice
  if (dto.confirmedPrice !== undefined) updates.confirmed_price = dto.confirmedPrice
  if (dto.currency       !== undefined) updates.currency        = dto.currency

  if (dto.specialInstructions !== undefined) updates.special_instructions = dto.specialInstructions
  if (dto.referenceNumber     !== undefined) updates.reference_number     = dto.referenceNumber
  if (dto.serviceType         !== undefined) updates.service_type         = dto.serviceType
  if (dto.serviceLevel        !== undefined) updates.service_level        = dto.serviceLevel
  if (dto.packageType         !== undefined) updates.package_type         = dto.packageType
  if (dto.preferredDeliveryDate !== undefined) updates.preferred_delivery_date = dto.preferredDeliveryDate

  const { data, error } = await deliveriesRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update delivery', error)

  if (Object.keys(updates).length > 0) {
    const loadNumber = (data.load_number as string | undefined) ?? id
    const creatorId  = data.created_by as string | undefined
    if (creatorId && creatorId !== userId) {
      notifyUser(creatorId, 'shipment_updated', 'Delivery updated', `Delivery ${loadNumber} was updated.`, id)
    }
    void notificationsService.notifyAllAdmins('shipment_updated', 'Delivery updated', `Delivery ${loadNumber} was updated.`, 'delivery', id, userId)
  }

  return data
}

// ── Status transition ─────────────────────────────────────────────────────────
export async function updateStatus(
  id:          string,
  dto:         UpdateDeliveryStatusDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
  ownScoped    = false,
) {
  const delivery      = await requireDeliveryAccess(id, isAdmin, accountId, userId, companyRole, false, ownScoped)
  const currentStatus = delivery.status as string

  assertTransition(currentStatus, dto.status)

  // Route-level requireAdmin (deliveries.routes.ts) is the actual gate here —
  // customers (residential and corporate) can view status/history but never
  // reach this function to mutate it.

  const updates: Record<string, unknown> = { status: dto.status }
  if (dto.status === 'picked_up') {
    updates.actual_pickup_date = new Date().toISOString()
  }
  if (dto.status === 'delivered') {
    updates.actual_delivery_date = new Date().toISOString()
  }

  const { data, error } = await deliveriesRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update status', error)

  // Residential Rewards Member program — 1 point per $1 spent (migration
  // 068). Fire-and-forget: never blocks the status update.
  if (dto.status === 'delivered' && delivery.customer_id) {
    const amountSpent = ((data as DeliveryRow).confirmed_price as number | null)
      ?? ((data as DeliveryRow).quoted_price as number | null)
      ?? 0
    void rewardsCreditService.earnPointsForDelivery(delivery.customer_id as string, id, amountSpent)
  }

  if (dto.reason || userId !== (delivery.created_by as string)) {
    const { error: historyError } = await deliveriesRepo.insertStatusHistoryEntry({
      deliveryId: id,
      oldStatus:  currentStatus,
      newStatus:  dto.status,
      changedBy:  userId,
      reason:     dto.reason,
    })
    if (historyError) {
      logger.error('Failed to write delivery status history entry', { deliveryId: id, error: historyError.message })
    }
  }

  const loadNumber = (delivery.load_number as string | undefined) ?? id

  // Dashboard-alert copy per status, taken from the client's spec ("Dashboard
  // Alert" column). `customer*` reaches the customer/company + creator;
  // `staff*` reaches assigned Logical Links staff; `adminBody` goes to
  // leadership via notifyAllAdmins.
  const STATUS_MESSAGES: Partial<Record<string, {
    type: NotifyType
    customerTitle: string
    customerBody:  string
    staffTitle:    string
    staffBody:     string
    adminBody:     string
  }>> = {
    confirmed: {
      type: 'shipment_confirmed',
      customerTitle: 'Booking confirmed',
      customerBody:  `Your booking ${loadNumber} has been confirmed.`,
      staffTitle:    'Delivery confirmed',
      staffBody:     `Delivery ${loadNumber} was confirmed — view pickup/dropoff details.`,
      adminBody:     `Delivery ${loadNumber} was confirmed.`,
    },
    assigned: {
      type: 'shipment_assigned',
      customerTitle: 'Delivery assigned',
      customerBody:  `A driver or carrier has been assigned to ${loadNumber}.`,
      staffTitle:    'Delivery assigned to you',
      staffBody:     `Delivery ${loadNumber} was assigned to you — view pickup/dropoff details.`,
      adminBody:     `Delivery ${loadNumber} was assigned to a driver.`,
    },
    picked_up: {
      type: 'shipment_picked_up',
      customerTitle: 'Shipment picked up',
      customerBody:  `Your shipment ${loadNumber} has been picked up.`,
      staffTitle:    'Delivery status updated',
      staffBody:     `Delivery ${loadNumber} status updated to picked up — view pickup/dropoff details.`,
      adminBody:     `Delivery ${loadNumber} was marked picked up.`,
    },
    in_transit: {
      type: 'shipment_in_transit',
      customerTitle: 'In transit',
      customerBody:  `Your shipment ${loadNumber} is currently in transit.`,
      staffTitle:    'Delivery status updated',
      staffBody:     `Delivery ${loadNumber} status updated to in transit — view pickup/dropoff details.`,
      adminBody:     `Delivery ${loadNumber} is now in transit.`,
    },
    out_for_delivery: {
      type: 'shipment_out_for_delivery',
      customerTitle: 'Out for delivery',
      customerBody:  `Your delivery ${loadNumber} is on its way to the destination.`,
      staffTitle:    'Delivery status updated',
      staffBody:     `Delivery ${loadNumber} status updated to out for delivery — view pickup/dropoff details.`,
      adminBody:     `Delivery ${loadNumber} is out for delivery.`,
    },
    delivered: {
      type: 'shipment_delivered',
      customerTitle: 'Delivery completed',
      customerBody:  `Your delivery ${loadNumber} has been successfully completed.`,
      staffTitle:    'Delivery status updated',
      staffBody:     `Delivery ${loadNumber} status updated to delivered — view pickup/dropoff details.`,
      adminBody:     `Delivery ${loadNumber} has been delivered.`,
    },
    cancelled: {
      type: 'shipment_cancelled',
      customerTitle: 'Booking cancelled',
      customerBody:  `Your booking ${loadNumber} has been cancelled.`,
      staffTitle:    'Delivery cancelled',
      staffBody:     `Delivery ${loadNumber} was cancelled.`,
      adminBody:     `Delivery ${loadNumber} was cancelled.`,
    },
  }

  const statusMsg = STATUS_MESSAGES[dto.status]
  if (statusMsg) {
    void notifyDeliveryStakeholders(data as DeliveryRow, {
      type:          statusMsg.type,
      actorId:       userId,
      customerTitle: statusMsg.customerTitle,
      customerBody:  statusMsg.customerBody,
      staffTitle:    statusMsg.staffTitle,
      staffBody:     statusMsg.staffBody,
    })
    // Leadership always hears about a status change, including ones an admin
    // made — excludeUserId just skips notifying that same admin about their
    // own action, not the whole admin audience.
    void notificationsService.notifyAllAdmins(statusMsg.type, statusMsg.customerTitle, statusMsg.adminBody, 'delivery', id, userId)

    // Email: only Picked Up / Out for Delivery / Delivered / Cancelled send
    // mail (per the client's event matrix).
    const emailTemplate = STATUS_EMAIL_TEMPLATES[dto.status as keyof typeof STATUS_EMAIL_TEMPLATES]
    if (emailTemplate) sendDeliveryLifecycleEmail(data as DeliveryRow, emailTemplate)
  }

  return data
}

// ── ETA (standalone) ─────────────────────────────────────────────────────────
// Any internal (Logical Links) user can set/clear the ops ETA without the
// broader 'deliveries.edit' permission a full edit requires — same spirit as
// the Status and Assign actions living outside the edit form. Route-level
// requireAdmin (deliveries.routes.ts) is the actual customer-exclusion gate.
export async function updateEta(id: string, dto: UpdateEtaDto, updatedBy: string) {
  const { data, error } = await deliveriesRepo.updateById(id, {
    estimated_delivery_date: dto.estimatedDeliveryDate,
  })
  if (error || !data) throw AppError.internal('Failed to update ETA', error)

  const loadNumber = (data.load_number as string | undefined) ?? id
  void notifyDeliveryStakeholders(data as DeliveryRow, {
    type:          'shipment_eta_updated',
    actorId:       updatedBy,
    customerTitle: 'Delivery ETA updated',
    customerBody:  `The estimated delivery date for ${loadNumber} was updated.`,
    staffTitle:    'Delivery ETA updated',
    staffBody:     `The estimated delivery date for ${loadNumber} was updated — view pickup/dropoff details.`,
  })
  void notificationsService.notifyAllAdmins('shipment_eta_updated', 'Delivery ETA updated', `ETA for delivery ${loadNumber} was updated.`, 'delivery', id, updatedBy)

  return data
}

// ── Assignable employees (lean roster for the Assign picker) ───────────────────
// Deliberately separate from admin-employees' listAdminEmployees(), which is
// gated behind 'employees.view' (HR access) and does an auth.users lookup per
// row for email — overkill for "who can I assign this delivery to", and would
// leave anyone with only 'deliveries.assign' (e.g. Manager) unable to fetch a
// roster at all despite being allowed to assign.
export async function listAssignableEmployees() {
  const { data, error } = await deliveriesRepo.findAssignableEmployees()
  if (error) throw AppError.internal('Failed to fetch assignable employees', error)
  return data ?? []
}

// ── Assign to Employees (Logical Links staff only) ─────────────────────────────
// Corporate customers never operate a delivery themselves (see migration
// 064) — there is no "hand this off to the customer's company" action
// anymore. Admin assigns internally instead: any active staff member, and
// more than one at once (e.g. a driver AND a dispatcher on the same
// delivery). Replaces the delivery's whole assignee set.
export async function assignEmployees(deliveryId: string, dto: AssignEmployeesDto, assignedBy: string) {
  const { data: raw, error: fetchErr } = await deliveriesRepo.findById(deliveryId)
  if (fetchErr || !raw) throw AppError.notFound('Delivery')

  if (dto.employeeIds.length > 0) {
    const { data: employees, error: employeesErr } = await supabase
      .from('profiles')
      .select('id, is_active')
      .eq('role', 'admin')
      .in('id', dto.employeeIds)

    if (employeesErr) throw AppError.internal('Failed to look up employees', employeesErr)

    const found = new Map((employees ?? []).map((e) => [e.id as string, e.is_active as boolean]))
    for (const employeeId of dto.employeeIds) {
      if (!found.has(employeeId)) throw AppError.notFound('Employee')
      if (!found.get(employeeId)) throw AppError.badRequest('One of the selected employees is not active')
    }
  }

  const { error } = await deliveriesRepo.setAssignments(deliveryId, dto.employeeIds, assignedBy)
  if (error) throw AppError.internal('Failed to assign employees', error)

  const existing   = raw as DeliveryRow
  const loadNumber = (existing.load_number as string | undefined) ?? deliveryId

  const newlyAssigned = new Set(dto.employeeIds)
  for (const employeeId of dto.employeeIds) {
    notifyUser(employeeId, 'shipment_assigned', 'Delivery assigned to you', `Delivery ${loadNumber} has been assigned to you — view pickup/dropoff details.`, deliveryId)
  }

  // Customer/company side + any previously-assigned staff (the just-assigned
  // employees already got the explicit copy above, so skip them here by
  // handing the helper the pre-update assignment set).
  void notifyDeliveryStakeholders(
    { ...existing, assignments: ((existing.assignments as Array<{ employee_id: string }> | undefined) ?? []).filter((a) => !newlyAssigned.has(a.employee_id)) },
    {
      type:          'shipment_assigned',
      actorId:       assignedBy,
      customerTitle: 'Delivery assigned',
      customerBody:  `A driver or carrier has been assigned to ${loadNumber}.`,
      staffTitle:    'Delivery status updated',
      staffBody:     `Delivery ${loadNumber} status updated — view pickup/dropoff details.`,
    },
  )
  void notificationsService.notifyAllAdmins(
    'shipment_assigned',
    'Delivery assigned',
    `Delivery ${loadNumber} was assigned to ${dto.employeeIds.length} employee(s).`,
    'delivery',
    deliveryId,
    assignedBy,
  )

  const { data } = await deliveriesRepo.findById(deliveryId)
  return data
}

// ── Soft delete ───────────────────────────────────────────────────────────────
export async function deleteDelivery(
  id:          string,
  dto:         DeleteDeliveryDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
  ownScoped    = false,
) {
  const delivery      = await requireDeliveryAccess(id, isAdmin, accountId, userId, companyRole, false, ownScoped)
  const currentStatus = delivery.status as DeliveryStatus

  // A delivery can be deleted in any status — this is a soft delete that also
  // writes a `[DELETED]` audit entry to the status history, so nothing is lost.

  const { error } = await deliveriesRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to delete delivery', error)

  const { error: historyError } = await deliveriesRepo.insertStatusHistoryEntry({
    deliveryId: id,
    oldStatus:  currentStatus,
    newStatus:  'cancelled',
    changedBy:  userId,
    reason:     `[DELETED] ${dto.reason}`,
  })
  if (historyError) {
    logger.error('Delivery deleted but failed to write audit history entry', { deliveryId: id, error: historyError.message })
  }

  const loadNumber = (delivery.load_number as string | undefined) ?? id
  void notifyDeliveryStakeholders(delivery, {
    type:          'shipment_cancelled',
    actorId:       userId,
    customerTitle: 'Booking cancelled',
    customerBody:  `Your booking ${loadNumber} has been cancelled.`,
    staffTitle:    'Delivery cancelled',
    staffBody:     `Delivery ${loadNumber} was cancelled.`,
  })
  // Email: Cancelled (per the client's event matrix).
  sendDeliveryLifecycleEmail(delivery, STATUS_EMAIL_TEMPLATES.cancelled)
  void notificationsService.notifyAllAdmins('shipment_deleted', 'Delivery deleted', `Delivery ${loadNumber} was deleted: ${dto.reason}`, 'delivery', id, userId)
}

// ── Archive ───────────────────────────────────────────────────────────────────
// Archiving is a reversible filing action (unlike delete) — it only moves a
// delivery out of the day-to-day workspace views into "Archived Deliveries".
// Only deliveries already in a terminal state (delivered/cancelled) may be
// archived; there's nothing to file away on a delivery still in progress.
export async function archiveDelivery(
  id:          string,
  dto:         ArchiveDeliveryDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
  ownScoped    = false,
) {
  const delivery = await requireDeliveryAccess(id, isAdmin, accountId, userId, companyRole, false, ownScoped)
  const currentStatus = delivery.status as string

  if (!TERMINAL_STATUSES.has(currentStatus)) {
    throw AppError.unprocessable(`Only completed or cancelled deliveries can be archived (current status: '${currentStatus}')`)
  }

  const { error } = await deliveriesRepo.archiveById(id)
  if (error) throw AppError.internal('Failed to archive delivery', error)

  await deliveriesRepo.insertStatusHistoryEntry({
    deliveryId: id,
    oldStatus:  currentStatus,
    newStatus:  currentStatus,
    changedBy:  userId,
    reason:     dto.reason ? `[ARCHIVED] ${dto.reason}` : '[ARCHIVED]',
  })

  const { data } = await deliveriesRepo.findById(id)
  return data
}

export async function unarchiveDelivery(
  id:          string,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
  ownScoped    = false,
) {
  const delivery = await requireDeliveryAccess(id, isAdmin, accountId, userId, companyRole, false, ownScoped)
  const currentStatus = delivery.status as string

  const { error } = await deliveriesRepo.unarchiveById(id)
  if (error) throw AppError.internal('Failed to unarchive delivery', error)

  await deliveriesRepo.insertStatusHistoryEntry({
    deliveryId: id,
    oldStatus:  currentStatus,
    newStatus:  currentStatus,
    changedBy:  userId,
    reason:     '[UNARCHIVED]',
  })

  const { data } = await deliveriesRepo.findById(id)
  return data
}
