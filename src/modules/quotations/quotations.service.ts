import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as repo from './quotations.repository'
import * as notificationsService from '../notifications/notifications.service'
import { generateAndUploadQuotationPdf } from '../../services/pdf.service'
import type { CreateQuotationDto, UpdateQuotationDto, ListQuotationsQuery, AcceptQuotationDto } from './quotations.schema'

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(
  userId:   string,
  type:     'quotation_sent' | 'quotation_accepted' | 'quotation_rejected',
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

export async function listQuotations(
  query: ListQuotationsQuery,
  callerRole: string,
  callerId: string,
  callerAccountId?: string | null,
  companyRole?: string | null,
) {
  const accountId    = callerRole === 'shipper' ? (callerAccountId ?? undefined) : undefined
  const employeeId   = callerRole === 'shipper' && companyRole === 'employee' ? callerId : undefined
  // Customers never see internal drafts — only quotations that have been issued to them.
  const excludeDraft = callerRole === 'shipper'
  const { data, count, error } = await repo.findAll(query, accountId, employeeId, excludeDraft)
  if (error) throw AppError.internal('Failed to fetch quotations', error)
  return { quotations: data ?? [], total: count ?? 0 }
}

export async function getQuotationStats(
  callerRole: string,
  callerId: string,
  callerAccountId?: string | null,
  companyRole?: string | null,
) {
  const accountId    = callerRole === 'shipper' ? (callerAccountId ?? undefined) : undefined
  const employeeId   = callerRole === 'shipper' && companyRole === 'employee' ? callerId : undefined
  const excludeDraft = callerRole === 'shipper'
  return repo.getStats(accountId, employeeId, excludeDraft)
}

export async function getQuotation(
  id: string,
  callerRole: string,
  callerAccountId?: string | null,
  callerId?: string,
  companyRole?: string | null,
) {
  const { data, error } = await repo.findById(id)
  if (error || !data) throw AppError.notFound('Quotation')

  if (callerRole === 'shipper') {
    if (!callerAccountId) throw AppError.forbidden()
    // Customers never see internal drafts — treat as not found, same as any other doc they can't access.
    if (data.status === 'draft') throw AppError.notFound('Quotation')

    if (companyRole === 'employee' && callerId) {
      if (!data.load_id || !(await repo.loadBelongsToEmployee(data.load_id, callerId))) {
        throw AppError.forbidden()
      }
    } else if (companyRole === 'company_admin') {
      if (!(await repo.documentBelongsToCompany(data.load_id, data.profile_id, callerAccountId))) {
        throw AppError.forbidden()
      }
    } else {
      throw AppError.forbidden()
    }
  }

  return data
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
    expiry_date:      dto.expiryDate ?? null,
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
      `Quotation ${quotationNumber} was sent to a shipper.`,
      'quotation',
      quotation.id,
    )
  }

  const { data: full } = await repo.findById(quotation.id)
  return full
}

export async function updateQuotation(
  id: string,
  dto: UpdateQuotationDto,
  callerRole: string,
  callerId?: string,
  companyRole?: string | null,
  callerAccountId?: string | null,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Quotation')

  if (callerRole === 'shipper' && existing.status !== 'draft') {
    throw AppError.forbidden('Only draft quotations can be edited')
  }

  // Accepted/Rejected are recorded exclusively via the shipper's /accept and
  // /decline endpoints — this PATCH route is admin-only, so it may only move
  // a quotation between Draft and Sent.
  if (dto.status !== undefined && dto.status !== 'draft' && dto.status !== 'sent') {
    throw AppError.forbidden('Status can only be set to Draft or Sent here — Accepted/Declined are set by the shipper')
  }

  if (callerRole === 'shipper') {
    if (companyRole === 'employee' && callerId) {
      if (!existing.load_id || !(await repo.loadBelongsToEmployee(existing.load_id, callerId))) {
        throw AppError.forbidden()
      }
    } else if (companyRole === 'company_admin' && callerAccountId) {
      if (!(await repo.documentBelongsToCompany(existing.load_id, existing.profile_id, callerAccountId))) {
        throw AppError.forbidden()
      }
    } else {
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

  // Only Draft → Sent is reachable here (see guard above) — Accepted/Rejected
  // notifications are fired from acceptQuotation/declineQuotation instead.
  if (dto.status === 'sent' && dto.status !== existing.status) {
    const quotationNumber = updated.quotation_number as string
    notifyUser(existing.profile_id as string, 'quotation_sent', 'New quotation received', `Quotation ${quotationNumber} is ready for review.`, id)
  }

  const { data: full } = await repo.findById(id)
  return full
}

// Shared by accept/decline — same membership check used elsewhere in this module.
async function assertCustomerCanActOn(
  quotation: { load_id: string | null; profile_id: string },
  callerId: string,
  companyRole: string | null | undefined,
  callerAccountId: string | null | undefined,
): Promise<void> {
  if (companyRole === 'employee') {
    if (!quotation.load_id || !(await repo.loadBelongsToEmployee(quotation.load_id, callerId))) {
      throw AppError.forbidden()
    }
  } else if (companyRole === 'company_admin' && callerAccountId) {
    if (!(await repo.documentBelongsToCompany(quotation.load_id, quotation.profile_id, callerAccountId))) {
      throw AppError.forbidden()
    }
  } else {
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

// ── POST /:id/accept ──────────────────────────────────────────────────────────
export async function acceptQuotation(
  id: string,
  dto: AcceptQuotationDto,
  callerId: string,
  callerRole: string,
  companyRole: string | null | undefined,
  callerAccountId: string | null | undefined,
  context: { ipAddress?: string; userAgent?: string },
) {
  if (callerRole !== 'shipper') throw AppError.forbidden('Only customers can accept quotations')

  const { data: existing } = await repo.findById(id)
  if (!existing || existing.status === 'draft') throw AppError.notFound('Quotation')

  await assertCustomerCanActOn(existing, callerId, companyRole, callerAccountId)

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

  const { data: full } = await repo.findById(id)
  return full
}

// ── POST /:id/decline ─────────────────────────────────────────────────────────
export async function declineQuotation(
  id: string,
  callerId: string,
  callerRole: string,
  companyRole: string | null | undefined,
  callerAccountId: string | null | undefined,
) {
  if (callerRole !== 'shipper') throw AppError.forbidden('Only customers can decline quotations')

  const { data: existing } = await repo.findById(id)
  if (!existing || existing.status === 'draft') throw AppError.notFound('Quotation')

  await assertCustomerCanActOn(existing, callerId, companyRole, callerAccountId)

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
  callerId?: string,
  companyRole?: string | null,
  callerAccountId?: string | null,
) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Quotation')

  if (callerRole === 'shipper' && existing.status !== 'draft') {
    throw AppError.forbidden('Only draft quotations can be deleted')
  }

  if (callerRole === 'shipper') {
    if (companyRole === 'employee' && callerId) {
      if (!existing.load_id || !(await repo.loadBelongsToEmployee(existing.load_id, callerId))) {
        throw AppError.forbidden()
      }
    } else if (companyRole === 'company_admin' && callerAccountId) {
      if (!(await repo.documentBelongsToCompany(existing.load_id, existing.profile_id, callerAccountId))) {
        throw AppError.forbidden()
      }
    } else {
      throw AppError.forbidden()
    }
  }

  const { error } = await repo.softDelete(id)
  if (error) throw AppError.internal('Failed to delete quotation', error)
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

export async function generatePdf(
  id: string,
  callerRole: string,
  callerAccountId?: string | null,
  callerId?: string,
  companyRole?: string | null,
) {
  // Reuses getQuotation's ownership check (also hides drafts from shippers).
  const data = await getQuotation(id, callerRole, callerAccountId, callerId, companyRole)

  const pdfUrl = await generateAndUploadQuotationPdf(data)
  await repo.updatePdfUrl(id, pdfUrl)
  return { pdfUrl }
}
