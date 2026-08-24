import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as repo from './quotations.repository'
import * as notificationsService from '../notifications/notifications.service'
import * as rewardsCreditService from '../rewards-credit/rewards-credit.service'
import * as pricingService from '../pricing/pricing.service'
import * as deliveriesService from '../deliveries/deliveries.service'
import { generateAndUploadQuotationPdf } from '../../services/pdf.service'
import type { UserRole } from '../../middleware/auth.middleware'
import type { CreateDeliveryDto } from '../deliveries/deliveries.schema'
import type {
  CreateQuotationDto,
  UpdateQuotationDto,
  ListQuotationsQuery,
  AcceptQuotationDto,
  DecideAutoQuoteDto,
  CorporateQuoteRequestDto,
} from './quotations.schema'

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(
  userId:   string,
  type:     'quotation_sent' | 'quotation_updated' | 'quotation_accepted' | 'quotation_rejected' | 'quotation_deleted',
  title:    string,
  body:     string,
  entityId: string,
): void {
  void notificationsService
    .createNotification({ userId, type, title, body, entityType: 'quotation', entityId })
    .catch(() => undefined)
}

function computeTotals(items: { quantity: number; unit_price: number }[], discount: number, taxRate: number) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const tax      = Math.round((subtotal - discount) * taxRate * 100) / 100
  const total    = Math.round((subtotal - discount + tax) * 100) / 100
  return { subtotal: Math.round(subtotal * 100) / 100, tax, total }
}

// Corporate customers (role='corporate') have no employees of their own — one
// login per account — so the only non-admin, non-residential scope is by account.
export async function listQuotations(
  query: ListQuotationsQuery,
  callerRole: string,
  callerId: string,
  callerAccountId?: string | null,
) {
  const accountId    = callerRole === 'corporate' ? (callerAccountId ?? undefined) : undefined
  // Residential customers only ever see their own quotations (profile_id match) —
  // without this they fell through with no scope at all and could list every
  // company's quotations system-wide (see [[customer_types]] "grep every module
  // for callerRole === 'corporate'" lesson — this module had the exact gap).
  const profileId     = callerRole === 'residential' ? callerId : undefined
  // Customers never see internal drafts — only quotations that have been issued to them.
  const excludeDraft = callerRole === 'corporate' || callerRole === 'residential'
  const { data, count, error } = await repo.findAll(query, accountId, undefined, excludeDraft, profileId)
  if (error) throw AppError.internal('Failed to fetch quotations', error)
  return { quotations: data ?? [], total: count ?? 0 }
}

export async function getQuotationStats(
  callerRole: string,
  callerId: string,
  callerAccountId?: string | null,
) {
  const accountId    = callerRole === 'corporate' ? (callerAccountId ?? undefined) : undefined
  const profileId     = callerRole === 'residential' ? callerId : undefined
  const excludeDraft = callerRole === 'corporate' || callerRole === 'residential'
  return repo.getStats(accountId, undefined, excludeDraft, profileId)
}

export async function getQuotation(
  id: string,
  callerRole: string,
  callerAccountId?: string | null,
  callerId?: string,
) {
  const { data, error } = await repo.findById(id)
  if (error || !data) throw AppError.notFound('Quotation')

  if (callerRole === 'residential') {
    // Customers never see internal drafts — treat as not found, same as any other doc they can't access.
    if (data.status === 'draft' || data.profile_id !== callerId) throw AppError.notFound('Quotation')
  } else if (callerRole === 'corporate') {
    if (!callerAccountId) throw AppError.forbidden()
    // Customers never see internal drafts — treat as not found, same as any other doc they can't access.
    if (data.status === 'draft') throw AppError.notFound('Quotation')

    if (!(await repo.documentBelongsToCompany(data.load_id, data.profile_id, callerAccountId))) {
      throw AppError.forbidden()
    }
  }

  return data
}

// Quotations auto-expire 10 days after issue unless the admin sets a different date.
function defaultExpiryDate(issueDate: string): string {
  const d = new Date(`${issueDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 10)
  return d.toISOString().slice(0, 10)
}

export async function createQuotation(dto: CreateQuotationDto, createdBy: string) {
  const items = dto.items ?? []
  const { subtotal, tax, total } = computeTotals(items, dto.discount ?? 0, dto.taxRate ?? 0)

  const { data: quotation, error } = await repo.create({
    profile_id:       dto.profileId,
    load_id:          dto.loadId ?? null,
    created_by:       createdBy,
    status:           dto.status,
    issue_date:       dto.issueDate,
    expiry_date:      dto.expiryDate ?? defaultExpiryDate(dto.issueDate),
    customer_name:    dto.customerName,
    customer_company: dto.customerCompany ?? null,
    customer_email:   dto.customerEmail ?? null,
    customer_phone:   dto.customerPhone ?? null,
    billing_address:  dto.billingAddress ?? null,
    notes:            dto.notes ?? null,
    terms:            dto.terms ?? null,
    subtotal,
    discount:         dto.discount ?? 0,
    tax_rate:         dto.taxRate ?? 0,
    tax,
    total,
    currency:         dto.currency ?? 'CAD',
    origin_address:      dto.originAddress ?? null,
    origin_lat:          dto.originLat ?? null,
    origin_lng:          dto.originLng ?? null,
    destination_address: dto.destinationAddress ?? null,
    destination_lat:     dto.destinationLat ?? null,
    destination_lng:     dto.destinationLng ?? null,
    distance_km:         dto.distanceKm ?? null,
    origin_city:            dto.originCity ?? null,
    origin_state:           dto.originState ?? null,
    origin_postcode:        dto.originPostcode ?? null,
    destination_city:       dto.destinationCity ?? null,
    destination_state:      dto.destinationState ?? null,
    destination_postcode:   dto.destinationPostcode ?? null,
    cargo_description:      dto.cargoDescription ?? null,
    service_type:           dto.serviceType ?? null,
    service_level:           dto.serviceLevel ?? null,
    weight_kg:               dto.weightKg ?? null,
    pieces:                  dto.pieces ?? null,
    preferred_delivery_date: dto.preferredDeliveryDate ?? null,
  })

  if (error || !quotation) throw AppError.internal('Failed to create quotation', error)

  if (items.length > 0) {
    const rows = items.map((item, idx) => ({
      quotation_id: quotation.id,
      description:  item.description,
      category:     item.category,
      quantity:     item.quantity,
      unit:         item.unit,
      unit_price:   item.unit_price,
      amount:       Math.round(item.quantity * item.unit_price * 100) / 100,
      notes:        item.notes ?? null,
      sort_order:   item.sort_order ?? idx,
    }))
    const { error: itemsError } = await repo.upsertItems(quotation.id, rows)
    if (itemsError) throw AppError.internal('Failed to save quotation items', itemsError)
  }

  if (dto.status === 'sent') {
    const quotationNumber = quotation.quotation_number as string
    notifyUser(dto.profileId, 'quotation_sent', 'New quotation received', `Quotation ${quotationNumber} is ready for review.`, quotation.id)
    void notificationsService.notifyAllAdmins(
      'quotation_sent',
      'Quotation sent',
      `Quotation ${quotationNumber} was sent to a corporate.`,
      'quotation',
      quotation.id,
      createdBy,
    )
  }

  const { data: full } = await repo.findById(quotation.id)
  return full
}

// ── POST /quotations/{residential,corporate}-quote/decide ──────────────────────
// Self-service instant quote, for both residential customers (always) and
// corporate customers (their "same as residential" option instead of a
// manual request). The price-preview step itself is just POST
// /pricing/calculate — nothing is written to the DB until the customer
// decides. The quotation is created here directly at its final status,
// 'accepted' or 'rejected' — it never passes through 'sent', since it was
// never sent to anyone for review.
export async function decideAutoQuote(
  dto: DecideAutoQuoteDto,
  callerId: string,
  callerRole: 'residential' | 'corporate',
  callerEmail: string,
  callerAccountId: string | null | undefined,
  context: { ipAddress?: string; userAgent?: string },
) {
  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', callerId).maybeSingle(),
    callerRole === 'corporate' && callerAccountId
      ? supabase.from('accounts').select('account_name').eq('account_id', callerAccountId).maybeSingle()
      : Promise.resolve({ data: null as { account_name: string } | null }),
  ])

  const breakdown = await pricingService.calculateDeliveryPrice({
    serviceType:          dto.serviceType,
    serviceLevel:         dto.serviceLevel,
    distanceKm:           dto.distanceKm,
    weightKg:             dto.weightKg,
    additionalChargeKeys: dto.additionalChargeKeys,
  })

  const items = [
    {
      description: `${breakdown.label} Delivery (${breakdown.serviceLevelLabel})`,
      category:    'freight_charge' as const,
      quantity:    1,
      unit:        'delivery',
      unit_price:  breakdown.deliveryCharge,
      sort_order:  0,
    },
    ...(breakdown.weightCharge > 0 ? [{
      description: `Weight Surcharge (${breakdown.weightKg} kg × $${breakdown.weightPerKgRate.toFixed(2)}/kg)`,
      category:    'accessorial' as const,
      quantity:    1,
      unit:        'charge',
      unit_price:  breakdown.weightCharge,
      sort_order:  1,
    }] : []),
    ...breakdown.additionalCharges.map((c, idx) => ({
      description: c.label,
      category:    'accessorial' as const,
      quantity:    1,
      unit:        'charge',
      unit_price:  c.amount,
      sort_order:  idx + 2,
    })),
  ]

  const today  = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  const status = dto.decision === 'accept' ? 'accepted' : 'rejected'

  const created = await createQuotation(
    {
      profileId:    callerId,
      status,
      issueDate:    today,
      customerName:    dto.customerName || (profile?.full_name as string | null) ||
        (callerRole === 'residential' ? 'Residential Customer' : 'Shipping Company Contact'),
      customerCompany: callerRole === 'corporate' ? (dto.customerCompany || account?.account_name || null) : null,
      customerEmail:   dto.customerEmail || callerEmail,
      customerPhone:   dto.customerPhone || (profile?.phone as string | null) || null,
      currency:     'CAD',
      originAddress:        dto.originAddress,
      originLat:            dto.originLat,
      originLng:            dto.originLng,
      originCity:           dto.originCity,
      originState:          dto.originState,
      originPostcode:       dto.originPostcode,
      destinationAddress:   dto.destinationAddress,
      destinationLat:       dto.destinationLat,
      destinationLng:       dto.destinationLng,
      destinationCity:      dto.destinationCity,
      destinationState:     dto.destinationState,
      destinationPostcode:  dto.destinationPostcode,
      distanceKm:           dto.distanceKm,
      cargoDescription:     dto.cargoDescription,
      serviceType:          dto.serviceType,
      serviceLevel:         dto.serviceLevel,
      weightKg:             dto.weightKg,
      pieces:               dto.pieces,
      preferredDeliveryDate: dto.preferredDeliveryDate,
      notes:                dto.notes ?? null,
      items,
    } as CreateQuotationDto,
    callerId,
  )

  const quotationId     = (created as { id: string }).id
  const quotationNumber = (created as { quotation_number: string }).quotation_number

  if (dto.decision === 'accept') {
    await repo.update(quotationId, { accepted_at: nowIso })

    const { fullName, companyName } = await acceptanceIdentity(callerId, callerAccountId)
    // A bare IPv4/IPv6 shape check — an empty string or garbled proxy header
    // would otherwise reach the ip_address INET column and fail the insert.
    const ipAddress = context.ipAddress && /^[0-9a-fA-F.:]+$/.test(context.ipAddress) ? context.ipAddress : null
    const { error: acceptError } = await repo.createAcceptance({
      quotation_id:  quotationId,
      user_id:       callerId,
      full_name:     fullName,
      company_name:  companyName,
      ip_address:    ipAddress,
      user_agent:    context.userAgent ?? null,
      terms_version: dto.termsVersion as string,
    })
    if (acceptError) throw AppError.internal('Failed to record acceptance', acceptError)

    void notificationsService.notifyAllAdmins(
      'quotation_accepted',
      'Quotation accepted',
      `Quotation ${quotationNumber} has been accepted${companyName ? ` by ${companyName}` : ''}.`,
      'quotation',
      quotationId,
    )

    await createDeliveryFromAcceptedQuotation(created as Record<string, unknown>, quotationId, callerId, callerRole as UserRole)
  } else {
    await repo.update(quotationId, { declined_at: nowIso })
    void notificationsService.notifyAllAdmins(
      'quotation_rejected',
      'Quotation declined',
      `Quotation ${quotationNumber} has been declined.`,
      'quotation',
      quotationId,
    )
  }

  const { data: full } = await repo.findById(quotationId)
  return full
}

// ── POST /quotations/request ──────────────────────────────────────────────────
// Corporate self-service: submit a request with no price — an admin prices
// it afterward via the existing PATCH /:id + line items flow.
export async function createCorporateQuoteRequest(callerId: string, callerAccountId: string, dto: CorporateQuoteRequestDto) {
  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', callerId).maybeSingle(),
    supabase.from('accounts').select('account_name').eq('account_id', callerAccountId).maybeSingle(),
  ])

  const today = new Date().toISOString().slice(0, 10)

  const created = await createQuotation(
    {
      profileId:    callerId,
      status:       'requested',
      issueDate:    today,
      customerName:    dto.customerName || (profile?.full_name as string | null) || 'Shipping Company Contact',
      customerCompany: dto.customerCompany || (account?.account_name as string | null) || null,
      customerEmail:   dto.customerEmail,
      customerPhone:   dto.customerPhone || (profile?.phone as string | null) || null,
      currency:     'CAD',
      originAddress:        dto.originAddress,
      originLat:            dto.originLat,
      originLng:            dto.originLng,
      originCity:           dto.originCity,
      originState:          dto.originState,
      originPostcode:       dto.originPostcode,
      destinationAddress:   dto.destinationAddress,
      destinationLat:       dto.destinationLat,
      destinationLng:       dto.destinationLng,
      destinationCity:      dto.destinationCity,
      destinationState:     dto.destinationState,
      destinationPostcode:  dto.destinationPostcode,
      cargoDescription:     dto.cargoDescription,
      serviceType:          dto.serviceType,
      serviceLevel:         dto.serviceLevel,
      weightKg:             dto.weightKg,
      pieces:               dto.pieces,
      preferredDeliveryDate: dto.preferredDeliveryDate,
      notes:        dto.notes ?? null,
    } as CreateQuotationDto,
    callerId,
  )

  const quotationId = (created as { id: string }).id

  // No price yet — just a wishlist so admin's Pricing Calculator can
  // pre-tick the same options the customer asked for (migration 062).
  if (dto.additionalChargeKeys.length > 0) {
    await repo.update(quotationId, { requested_additional_charge_keys: dto.additionalChargeKeys })
  }

  const companyName = (account?.account_name as string | null) ?? 'A shipping company'
  void notificationsService.notifyAllAdmins(
    'quotation_requested',
    'New quote request',
    `${companyName} requested a quote for a new delivery.`,
    'quotation',
    quotationId,
  )

  const { data: full } = await repo.findById(quotationId)
  return full
}

export async function updateQuotation(
  id: string,
  dto: UpdateQuotationDto,
  callerRole: string,
  callerAccountId?: string | null,
  callerId?: string,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Quotation')

  if (callerRole === 'corporate' && existing.status !== 'draft') {
    throw AppError.forbidden('Only draft quotations can be edited')
  }

  // Accepted/Rejected are recorded exclusively via the corporate's /accept and
  // /decline endpoints — this PATCH route is admin-only, so it may only move
  // a quotation between Draft and Sent.
  if (dto.status !== undefined && dto.status !== 'draft' && dto.status !== 'sent') {
    throw AppError.forbidden('Status can only be set to Draft or Sent here — Accepted/Declined are set by the corporate')
  }

  // Corporate customers have no employees of their own — one login per account.
  if (callerRole === 'corporate') {
    if (!callerAccountId || !(await repo.documentBelongsToCompany(existing.load_id, existing.profile_id, callerAccountId))) {
      throw AppError.forbidden()
    }
  }

  const items = dto.items ?? []
  const subtotal = items.length > 0
    ? items.reduce((sum, i) => sum + (i.quantity ?? 0) * (i.unit_price ?? 0), 0)
    : existing.subtotal

  const discount = dto.discount ?? existing.discount ?? 0
  const taxRate  = dto.taxRate  ?? existing.tax_rate  ?? 0
  const tax      = Math.round((subtotal - discount) * taxRate * 100) / 100
  const total    = Math.round((subtotal - discount + tax) * 100) / 100

  const patch: Record<string, unknown> = {}
  if (dto.status        !== undefined) patch.status           = dto.status
  if (dto.issueDate     !== undefined) patch.issue_date       = dto.issueDate
  if (dto.expiryDate    !== undefined) patch.expiry_date      = dto.expiryDate
  if (dto.customerName  !== undefined) patch.customer_name    = dto.customerName
  if (dto.customerCompany !== undefined) patch.customer_company = dto.customerCompany
  if (dto.customerEmail !== undefined) patch.customer_email   = dto.customerEmail
  if (dto.customerPhone !== undefined) patch.customer_phone   = dto.customerPhone
  if (dto.billingAddress !== undefined) patch.billing_address = dto.billingAddress
  if (dto.notes         !== undefined) patch.notes            = dto.notes
  if (dto.terms         !== undefined) patch.terms            = dto.terms
  if (dto.loadId        !== undefined) patch.load_id          = dto.loadId
  if (dto.currency      !== undefined) patch.currency         = dto.currency
  if (dto.originAddress      !== undefined) patch.origin_address      = dto.originAddress
  if (dto.originLat          !== undefined) patch.origin_lat          = dto.originLat
  if (dto.originLng          !== undefined) patch.origin_lng          = dto.originLng
  if (dto.destinationAddress !== undefined) patch.destination_address = dto.destinationAddress
  if (dto.destinationLat     !== undefined) patch.destination_lat     = dto.destinationLat
  if (dto.destinationLng     !== undefined) patch.destination_lng     = dto.destinationLng
  if (dto.distanceKm         !== undefined) patch.distance_km         = dto.distanceKm
  if (dto.originCity          !== undefined) patch.origin_city          = dto.originCity
  if (dto.originState         !== undefined) patch.origin_state         = dto.originState
  if (dto.originPostcode      !== undefined) patch.origin_postcode      = dto.originPostcode
  if (dto.destinationCity     !== undefined) patch.destination_city     = dto.destinationCity
  if (dto.destinationState    !== undefined) patch.destination_state    = dto.destinationState
  if (dto.destinationPostcode !== undefined) patch.destination_postcode = dto.destinationPostcode
  if (dto.cargoDescription    !== undefined) patch.cargo_description    = dto.cargoDescription
  if (dto.serviceType         !== undefined) patch.service_type         = dto.serviceType
  if (dto.serviceLevel        !== undefined) patch.service_level        = dto.serviceLevel
  if (dto.weightKg            !== undefined) patch.weight_kg            = dto.weightKg
  if (dto.pieces              !== undefined) patch.pieces               = dto.pieces
  if (dto.preferredDeliveryDate !== undefined) patch.preferred_delivery_date = dto.preferredDeliveryDate
  patch.subtotal = subtotal
  patch.discount = discount
  patch.tax_rate = taxRate
  patch.tax      = tax
  patch.total    = total

  const { data: updated, error } = await repo.update(id, patch)
  if (error || !updated) throw AppError.internal('Failed to update quotation', error)

  if (dto.items !== undefined) {
    const rows = items.map((item, idx) => ({
      quotation_id: id,
      description:  item.description,
      category:     item.category,
      quantity:     item.quantity,
      unit:         item.unit,
      unit_price:   item.unit_price,
      amount:       Math.round((item.quantity ?? 0) * (item.unit_price ?? 0) * 100) / 100,
      notes:        item.notes ?? null,
      sort_order:   item.sort_order ?? idx,
    }))
    const { error: itemsError } = await repo.upsertItems(id, rows)
    if (itemsError) throw AppError.internal('Failed to save quotation items', itemsError)
  }

  const quotationNumber = updated.quotation_number as string

  // Only Draft → Sent is reachable here (see guard above) — Accepted/Rejected
  // notifications are fired from acceptQuotation/declineQuotation instead.
  if (dto.status === 'sent' && dto.status !== existing.status) {
    notifyUser(existing.profile_id as string, 'quotation_sent', 'New quotation received', `Quotation ${quotationNumber} is ready for review.`, id)
  } else {
    // A non-status edit (pricing, items, addresses, etc.) — worth telling
    // the customer their quotation changed, and leadership either way.
    notifyUser(existing.profile_id as string, 'quotation_updated', 'Your quotation was updated', `Quotation ${quotationNumber} was updated.`, id)
  }
  void notificationsService.notifyAllAdmins('quotation_updated', 'Quotation updated', `Quotation ${quotationNumber} was updated.`, 'quotation', id, callerId)

  const { data: full } = await repo.findById(id)
  return full
}

// Shared by accept/decline — same membership check used elsewhere in this module.
// Corporate customers have no employees of their own — one login per account.
async function assertCustomerCanActOn(
  quotation: { load_id: string | null; profile_id: string },
  callerId: string,
  callerRole: string,
  callerAccountId: string | null | undefined,
): Promise<void> {
  // Residential customers have no account — a quotation belongs to
  // them directly via profile_id, same as it belongs to a corporate via account.
  if (callerRole === 'residential') {
    if (quotation.profile_id !== callerId) throw AppError.forbidden()
    return
  }

  if (!callerAccountId || !(await repo.documentBelongsToCompany(quotation.load_id, quotation.profile_id, callerAccountId))) {
    throw AppError.forbidden()
  }
}

async function acceptanceIdentity(userId: string, accountId: string | null | undefined) {
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  let companyName: string | null = null
  if (accountId) {
    const { data: account } = await supabase.from('accounts').select('account_name').eq('account_id', accountId).maybeSingle()
    companyName = account?.account_name ?? null
  }
  return { fullName: (profile?.full_name as string | null) ?? null, companyName }
}

// Creates the matching delivery the moment a quotation is accepted (both
// residential and corporate). Fails closed with a clear error rather than
// silently leaving an accepted quotation with no delivery — quotations from
// before this feature (or admin-authored ones missing structured address
// fields) won't have everything this needs.
const DELIVERY_REQUIRED_FIELDS = [
  'origin_address', 'origin_city', 'origin_state', 'origin_postcode',
  'destination_address', 'destination_city', 'destination_state', 'destination_postcode',
  'cargo_description',
] as const

async function createDeliveryFromAcceptedQuotation(
  quotation: Record<string, unknown>,
  quotationId: string,
  callerId: string,
  callerRole: UserRole,
): Promise<void> {
  const missing = DELIVERY_REQUIRED_FIELDS.filter((key) => !quotation[key])
  if (missing.length > 0) {
    throw AppError.unprocessable(
      'This quotation is missing delivery details required to create a delivery — contact support',
    )
  }

  const dto: CreateDeliveryDto = {
    deliveryType:  quotation.service_type ? 'last_mile' : 'freight',
    serviceType:   (quotation.service_type as string | null) ?? undefined,
    serviceLevel:  (quotation.service_level as string | null) ?? undefined,
    preferredDeliveryDate: (quotation.preferred_delivery_date as string | null) ?? undefined,
    originAddress:        quotation.origin_address as string,
    originCity:           quotation.origin_city as string,
    originState:          quotation.origin_state as string,
    originPostcode:       quotation.origin_postcode as string,
    originCountry:        'Australia',
    destinationAddress:   quotation.destination_address as string,
    destinationCity:      quotation.destination_city as string,
    destinationState:     quotation.destination_state as string,
    destinationPostcode:  quotation.destination_postcode as string,
    destinationCountry:   'Australia',
    cargoDescription:     quotation.cargo_description as string,
    weightKg:             (quotation.weight_kg as number | null) ?? undefined,
    pieces:               (quotation.pieces as number | null) ?? undefined,
    specialInstructions:  (quotation.notes as string | null) ?? undefined,
    isDangerousGoods:      false,
    requiresRefrigeration: false,
    quotedPrice: Number(quotation.total) || undefined,
    currency:    (quotation.currency as string | null) ?? 'CAD',
    ...(callerRole === 'residential' ? { customerId: callerId } : {}),
  }

  const delivery = await deliveriesService.createDelivery(dto, callerId, callerRole)
  await repo.update(quotationId, { load_id: (delivery as { shipment_id: string }).shipment_id })
}

// ── POST /:id/accept ──────────────────────────────────────────────────────────
export async function acceptQuotation(
  id: string,
  dto: AcceptQuotationDto,
  callerId: string,
  callerRole: string,
  callerAccountId: string | null | undefined,
  context: { ipAddress?: string; userAgent?: string },
) {
  if (callerRole !== 'corporate' && callerRole !== 'residential') throw AppError.forbidden('Only customers can accept quotations')

  const { data: existing } = await repo.findById(id)
  if (!existing || existing.status === 'draft') throw AppError.notFound('Quotation')

  await assertCustomerCanActOn(existing, callerId, callerRole, callerAccountId)

  // Once an admin has converted this quotation to an invoice, it's frozen
  // from every customer-facing action — only admin's own PATCH /:id can
  // still touch it.
  if (await repo.hasInvoice(id)) {
    throw AppError.conflict('An invoice has already been created from this quotation — contact support for further changes')
  }

  // A quotation can be legitimately "accepted" with no delivery yet if a
  // prior attempt recorded the acceptance (a compliance record — never
  // rolled back, see createAcceptance) but then failed to create the
  // matching delivery (e.g. the RLS gap fixed in migration 058). Retry
  // delivery creation here instead of conflicting forever with no way out.
  if (existing.status === 'accepted' && !existing.load_id) {
    await createDeliveryFromAcceptedQuotation(existing, id, callerId, callerRole as UserRole)
    const { data: healed } = await repo.findById(id)
    return healed
  }

  if (existing.status === 'accepted') throw AppError.conflict('Quotation has already been accepted')
  if (existing.status === 'rejected') throw AppError.conflict('Quotation has already been declined')
  if (existing.status !== 'sent') throw AppError.unprocessable('Only quotations awaiting review can be accepted')

  const today = new Date().toISOString().slice(0, 10)
  if (existing.expiry_date && (existing.expiry_date as string) < today) {
    throw AppError.unprocessable('This quotation has expired and can no longer be accepted')
  }

  const acceptedAt = new Date().toISOString()
  const { data: acceptedRow, error: updateError } = await repo.updateIfStatus(id, 'sent', { status: 'accepted', accepted_at: acceptedAt })
  if (updateError) throw AppError.internal('Failed to accept quotation', updateError)
  // No row matched `status = 'sent'` anymore — another request (double-click,
  // retry) already changed it between our read above and this write.
  if (!acceptedRow) throw AppError.conflict('This quotation was already acted on')

  const { fullName, companyName } = await acceptanceIdentity(callerId, callerAccountId)
  // A bare IPv4/IPv6 shape check — an empty string or garbled proxy header
  // would otherwise reach the ip_address INET column and fail the insert.
  const ipAddress = context.ipAddress && /^[0-9a-fA-F.:]+$/.test(context.ipAddress) ? context.ipAddress : null
  const { error: acceptError } = await repo.createAcceptance({
    quotation_id:  id,
    user_id:       callerId,
    full_name:     fullName,
    company_name:  companyName,
    ip_address:    ipAddress,
    user_agent:    context.userAgent ?? null,
    terms_version: dto.termsVersion,
  })
  if (acceptError) {
    // Roll back the status flip so the quotation isn't stuck permanently
    // "accepted" with no acceptance record and no way to retry.
    await repo.update(id, { status: 'sent', accepted_at: null })
    throw AppError.internal('Failed to record acceptance', acceptError)
  }

  const quotationNumber = existing.quotation_number as string
  void notificationsService.notifyAllAdmins(
    'quotation_accepted',
    'Quotation accepted',
    `Quotation ${quotationNumber} has been accepted${companyName ? ` by ${companyName}` : ''}.`,
    'quotation',
    id,
  )

  await createDeliveryFromAcceptedQuotation(existing, id, callerId, callerRole as UserRole)

  const { data: full } = await repo.findById(id)
  return full
}

// ── POST /:id/decline ─────────────────────────────────────────────────────────
export async function declineQuotation(
  id: string,
  callerId: string,
  callerRole: string,
  callerAccountId: string | null | undefined,
) {
  if (callerRole !== 'corporate' && callerRole !== 'residential') throw AppError.forbidden('Only customers can decline quotations')

  const { data: existing } = await repo.findById(id)
  if (!existing || existing.status === 'draft') throw AppError.notFound('Quotation')

  await assertCustomerCanActOn(existing, callerId, callerRole, callerAccountId)

  // Once an admin has converted this quotation to an invoice, it's frozen
  // from every customer-facing action — only admin's own PATCH /:id can
  // still touch it.
  if (await repo.hasInvoice(id)) {
    throw AppError.conflict('An invoice has already been created from this quotation — contact support for further changes')
  }

  if (existing.status === 'accepted') throw AppError.conflict('Quotation has already been accepted')
  if (existing.status === 'rejected') throw AppError.conflict('Quotation has already been declined')
  if (existing.status !== 'sent') throw AppError.unprocessable('Only quotations awaiting review can be declined')

  const { data: declinedRow, error } = await repo.updateIfStatus(id, 'sent', { status: 'rejected', declined_at: new Date().toISOString() })
  if (error) throw AppError.internal('Failed to decline quotation', error)
  if (!declinedRow) throw AppError.conflict('This quotation was already acted on')

  const quotationNumber = existing.quotation_number as string
  void notificationsService.notifyAllAdmins(
    'quotation_rejected',
    'Quotation declined',
    `Quotation ${quotationNumber} has been declined.`,
    'quotation',
    id,
  )

  const { data: full } = await repo.findById(id)
  return full
}

export async function deleteQuotation(
  id: string,
  callerRole: string,
  callerAccountId?: string | null,
  callerId?: string,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Quotation')

  if (callerRole === 'corporate' && existing.status !== 'draft') {
    throw AppError.forbidden('Only draft quotations can be deleted')
  }

  // Corporate customers have no employees of their own — one login per account.
  if (callerRole === 'corporate') {
    if (!callerAccountId || !(await repo.documentBelongsToCompany(existing.load_id, existing.profile_id, callerAccountId))) {
      throw AppError.forbidden()
    }
  }

  const { error } = await repo.softDelete(id)
  if (error) throw AppError.internal('Failed to delete quotation', error)

  const quotationNumber = existing.quotation_number as string
  if (existing.profile_id && existing.profile_id !== callerId) {
    notifyUser(existing.profile_id as string, 'quotation_deleted', 'Quotation deleted', `Quotation ${quotationNumber} was deleted.`, id)
  }
  void notificationsService.notifyAllAdmins('quotation_deleted', 'Quotation deleted', `Quotation ${quotationNumber} was deleted.`, 'quotation', id, callerId)
}

export async function duplicateQuotation(id: string, createdBy: string) {
  const { data: source } = await repo.findById(id)
  if (!source) throw AppError.notFound('Quotation')

  const dto: CreateQuotationDto = {
    profileId:       source.profile_id,
    loadId:          source.load_id ?? null,
    status:          'draft',
    issueDate:       new Date().toISOString().slice(0, 10),
    expiryDate:      source.expiry_date ?? null,
    customerName:    source.customer_name,
    customerCompany: source.customer_company ?? null,
    customerEmail:   source.customer_email ?? null,
    customerPhone:   source.customer_phone ?? null,
    billingAddress:  source.billing_address ?? null,
    notes:           source.notes ?? null,
    terms:           source.terms ?? null,
    subtotal:        source.subtotal,
    discount:        source.discount,
    taxRate:         source.tax_rate,
    tax:             source.tax,
    total:           source.total,
    currency:        source.currency,
    originAddress:      source.origin_address ?? null,
    originLat:          source.origin_lat ?? null,
    originLng:          source.origin_lng ?? null,
    destinationAddress: source.destination_address ?? null,
    destinationLat:     source.destination_lat ?? null,
    destinationLng:     source.destination_lng ?? null,
    distanceKm:         source.distance_km ?? null,
    items: (source.quotation_items ?? []).map((i: Record<string, unknown>, idx: number) => ({
      description: i.description as string,
      category:    i.category as never,
      quantity:    Number(i.quantity),
      unit:        i.unit as string,
      unit_price:  Number(i.unit_price),
      amount:      Number(i.amount),
      notes:       (i.notes as string | null) ?? undefined,
      sort_order:  idx,
    })),
  }

  return createQuotation(dto, createdBy)
}

// ── POST /:id/apply-rewards-credit ────────────────────────────────────────────
// Residential-only. Applies min(balance, max_redemption% × total) as a credit
// against this quotation, recorded on both the ledger and the quotation row.
export async function applyRewardsCredit(id: string, callerId: string, callerRole: string) {
  const { data: quotation } = await repo.findById(id)
  if (!quotation) throw AppError.notFound('Quotation')

  if (callerRole !== 'residential' || quotation.profile_id !== callerId) {
    throw AppError.forbidden('Only the residential customer this quotation belongs to can apply Rewards Credit')
  }

  // Once an admin has converted this quotation to an invoice, it's frozen
  // from every customer-facing action — only admin's own PATCH /:id can
  // still touch it.
  if (await repo.hasInvoice(id)) {
    throw AppError.conflict('An invoice has already been created from this quotation — contact support for further changes')
  }

  if (quotation.status !== 'sent') {
    throw AppError.unprocessable('Rewards Credit can only be applied to a quotation awaiting review')
  }

  if (quotation.rewards_credit_applied && Number(quotation.rewards_credit_applied) > 0) {
    throw AppError.conflict('Rewards Credit has already been applied to this quotation')
  }

  const { appliedDollars, appliedPoints, newBalance } = await rewardsCreditService.redeemPointsForQuotation(
    callerId,
    id,
    Number(quotation.total),
  )

  if (appliedDollars === 0) {
    return { quotation, applied: 0, appliedPoints: 0, remainingBalance: newBalance }
  }

  const { data: updated, error } = await repo.update(id, { rewards_credit_applied: appliedDollars })
  if (error) throw AppError.internal('Failed to record Rewards points on quotation', error)

  void notificationsService.notifyAllAdmins(
    'quotation_updated',
    'Rewards points redeemed',
    `${appliedPoints} points ($${appliedDollars.toFixed(2)}) were redeemed on quotation ${quotation.quotation_number as string}.`,
    'quotation',
    id,
  )

  return { quotation: updated, applied: appliedDollars, appliedPoints, remainingBalance: newBalance }
}

export async function generatePdf(
  id: string,
  callerRole: string,
  callerAccountId?: string | null,
  callerId?: string,
) {
  // Reuses getQuotation's ownership check (also hides drafts from corporates).
  const data = await getQuotation(id, callerRole, callerAccountId, callerId)

  const pdfUrl = await generateAndUploadQuotationPdf(data)
  await repo.updatePdfUrl(id, pdfUrl)
  return { pdfUrl }
}
