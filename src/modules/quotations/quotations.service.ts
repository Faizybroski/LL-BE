import { AppError } from '../../lib/errors'
import * as repo from './quotations.repository'
import { generateAndUploadQuotationPdf } from '../../services/pdf.service'
import type { CreateQuotationDto, UpdateQuotationDto, ListQuotationsQuery } from './quotations.schema'

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
  const accountId  = callerRole === 'shipper' ? (callerAccountId ?? undefined) : undefined
  const employeeId = callerRole === 'shipper' && companyRole === 'employee' ? callerId : undefined
  const { data, count, error } = await repo.findAll(query, accountId, employeeId)
  if (error) throw AppError.internal('Failed to fetch quotations')
  return { quotations: data ?? [], total: count ?? 0 }
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

    if (companyRole === 'employee' && callerId) {
      if (!data.load_id || !(await repo.loadBelongsToEmployee(data.load_id, callerId))) {
        throw AppError.forbidden()
      }
    } else if (companyRole === 'company_admin') {
      if (!(await repo.documentBelongsToCompany(data.load_id, data.profile_id, callerAccountId))) {
        throw AppError.forbidden()
      }
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
    currency:         dto.currency ?? 'AUD',
  })

  if (error || !quotation) throw AppError.internal('Failed to create quotation')

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
    if (itemsError) throw AppError.internal('Failed to save quotation items')
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

  if (callerRole === 'shipper') {
    if (companyRole === 'employee' && callerId) {
      if (!existing.load_id || !(await repo.loadBelongsToEmployee(existing.load_id, callerId))) {
        throw AppError.forbidden()
      }
    } else if (companyRole === 'company_admin' && callerAccountId) {
      if (!(await repo.documentBelongsToCompany(existing.load_id, existing.profile_id, callerAccountId))) {
        throw AppError.forbidden()
      }
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
  patch.subtotal = subtotal
  patch.discount = discount
  patch.tax_rate = taxRate
  patch.tax      = tax
  patch.total    = total

  const { data: updated, error } = await repo.update(id, patch)
  if (error || !updated) throw AppError.internal('Failed to update quotation')

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
    await repo.upsertItems(id, rows)
  }

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
    }
  }

  const { error } = await repo.softDelete(id)
  if (error) throw AppError.internal('Failed to delete quotation')
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

export async function generatePdf(id: string) {
  const { data } = await repo.findById(id)
  if (!data) throw AppError.notFound('Quotation')

  const pdfUrl = await generateAndUploadQuotationPdf(data)
  await repo.updatePdfUrl(id, pdfUrl)
  return { pdfUrl }
}
