import { AppError } from '../../lib/errors'
import * as repo from './invoices.repository'
import * as quotationsRepo from '../quotations/quotations.repository'
import { generateAndUploadInvoicePdf } from '../../services/pdf.service'
import type { CreateInvoiceDto, UpdateInvoiceDto, ListInvoicesQuery } from './invoices.schema'

function computeTotals(
  items: { quantity: number; unit_price: number }[],
  discount: number,
  taxRate: number,
  amountPaid: number,
) {
  const subtotal   = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const tax        = Math.round((subtotal - discount) * taxRate * 100) / 100
  const total      = Math.round((subtotal - discount + tax) * 100) / 100
  const balanceDue = Math.round((total - amountPaid) * 100) / 100
  return {
    subtotal:   Math.round(subtotal * 100) / 100,
    tax,
    total,
    balanceDue: Math.max(0, balanceDue),
  }
}

function itemsToRows(invoiceId: string, items: CreateInvoiceDto['items']) {
  return items.map((item, idx) => ({
    invoice_id:  invoiceId,
    description: item.description,
    category:    item.category,
    quantity:    item.quantity,
    unit:        item.unit,
    unit_price:  item.unit_price,
    amount:      Math.round(item.quantity * item.unit_price * 100) / 100,
    notes:       item.notes ?? null,
    sort_order:  item.sort_order ?? idx,
  }))
}

export async function listInvoices(query: ListInvoicesQuery, callerRole: string, callerId: string, callerAccountId?: string | null) {
  const accountId = callerRole === 'shipper' ? (callerAccountId ?? undefined) : undefined
  const { data, count, error } = await repo.findAll(query, accountId)
  if (error) throw AppError.internal('Failed to fetch invoices')
  return { invoices: data ?? [], total: count ?? 0 }
}

export async function getInvoice(id: string, callerRole: string, callerAccountId?: string | null) {
  const { data, error } = await repo.findById(id)
  if (error || !data) throw AppError.notFound('Invoice')
  return data
}

export async function createInvoice(dto: CreateInvoiceDto, createdBy: string) {
  const items = dto.items ?? []
  const amountPaid = dto.amountPaid ?? 0
  const { subtotal, tax, total, balanceDue } = computeTotals(items, dto.discount ?? 0, dto.taxRate ?? 0, amountPaid)

  const { data: invoice, error } = await repo.create({
    profile_id:           dto.profileId,
    load_id:              dto.loadId ?? null,
    quotation_id:         dto.quotationId ?? null,
    created_by:           createdBy,
    status:               dto.status,
    issue_date:           dto.issueDate,
    due_date:             dto.dueDate ?? null,
    customer_name:        dto.customerName,
    customer_company:     dto.customerCompany ?? null,
    customer_email:       dto.customerEmail ?? null,
    customer_phone:       dto.customerPhone ?? null,
    billing_address:      dto.billingAddress ?? null,
    notes:                dto.notes ?? null,
    terms:                dto.terms ?? null,
    payment_instructions: dto.paymentInstructions ?? null,
    subtotal,
    discount:             dto.discount ?? 0,
    tax_rate:             dto.taxRate ?? 0,
    tax,
    total,
    amount_paid:          amountPaid,
    balance_due:          balanceDue,
    currency:             dto.currency ?? 'AUD',
  })

  if (error || !invoice) {
    console.error(error) 
    throw AppError.internal('Failed to create invoice')}

  if (items.length > 0) {
    const rows = itemsToRows(invoice.id, items)
    const { error: itemsError } = await repo.upsertItems(invoice.id, rows)
    if (itemsError) throw AppError.internal('Failed to save invoice items')
  }

  const { data: full } = await repo.findById(invoice.id)
  return full
}

export async function updateInvoice(id: string, dto: UpdateInvoiceDto, callerRole: string) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Invoice')

  if (callerRole === 'shipper' && existing.status !== 'draft') {
    throw AppError.forbidden('Only draft invoices can be edited')
  }

  const items      = dto.items ?? []
  const amountPaid = dto.amountPaid ?? existing.amount_paid ?? 0
  const subtotal   = items.length > 0
    ? items.reduce((sum, i) => sum + (i.quantity ?? 0) * (i.unit_price ?? 0), 0)
    : existing.subtotal
  const discount   = dto.discount ?? existing.discount ?? 0
  const taxRate    = dto.taxRate  ?? existing.tax_rate  ?? 0
  const tax        = Math.round((subtotal - discount) * taxRate * 100) / 100
  const total      = Math.round((subtotal - discount + tax) * 100) / 100
  const balanceDue = Math.max(0, Math.round((total - amountPaid) * 100) / 100)

  const patch: Record<string, unknown> = {
    subtotal, discount, tax_rate: taxRate, tax, total,
    amount_paid: amountPaid, balance_due: balanceDue,
  }
  if (dto.status              !== undefined) patch.status               = dto.status
  if (dto.issueDate           !== undefined) patch.issue_date           = dto.issueDate
  if (dto.dueDate             !== undefined) patch.due_date             = dto.dueDate
  if (dto.customerName        !== undefined) patch.customer_name        = dto.customerName
  if (dto.customerCompany     !== undefined) patch.customer_company     = dto.customerCompany
  if (dto.customerEmail       !== undefined) patch.customer_email       = dto.customerEmail
  if (dto.customerPhone       !== undefined) patch.customer_phone       = dto.customerPhone
  if (dto.billingAddress      !== undefined) patch.billing_address      = dto.billingAddress
  if (dto.notes               !== undefined) patch.notes                = dto.notes
  if (dto.terms               !== undefined) patch.terms                = dto.terms
  if (dto.paymentInstructions !== undefined) patch.payment_instructions = dto.paymentInstructions
  if (dto.loadId              !== undefined) patch.load_id              = dto.loadId
  if (dto.currency            !== undefined) patch.currency             = dto.currency

  const { data: updated, error } = await repo.update(id, patch)
  if (error || !updated) throw AppError.internal('Failed to update invoice')

  if (dto.items !== undefined) {
    const rows = itemsToRows(id, items as CreateInvoiceDto['items'])
    await repo.upsertItems(id, rows)
  }

  const { data: full } = await repo.findById(id)
  return full
}

export async function deleteInvoice(id: string, callerRole: string) {
  const { data: existing } = await repo.findById(id)
  if (!existing) throw AppError.notFound('Invoice')

  if (callerRole === 'shipper' && existing.status !== 'draft') {
    throw AppError.forbidden('Only draft invoices can be deleted')
  }

  const { error } = await repo.softDelete(id)
  if (error) throw AppError.internal('Failed to delete invoice')
}

export async function duplicateInvoice(id: string, createdBy: string) {
  const { data: source } = await repo.findById(id)
  if (!source) throw AppError.notFound('Invoice')

  const dto: CreateInvoiceDto = {
    profileId:           source.profile_id,
    loadId:              source.load_id ?? null,
    quotationId:         null,
    status:              'draft',
    issueDate:           new Date().toISOString().slice(0, 10),
    dueDate:             source.due_date ?? null,
    customerName:        source.customer_name,
    customerCompany:     source.customer_company ?? null,
    customerEmail:       source.customer_email ?? null,
    customerPhone:       source.customer_phone ?? null,
    billingAddress:      source.billing_address ?? null,
    notes:               source.notes ?? null,
    terms:               source.terms ?? null,
    paymentInstructions: source.payment_instructions ?? null,
    subtotal:            source.subtotal,
    discount:            source.discount,
    taxRate:             source.tax_rate,
    tax:                 source.tax,
    total:               source.total,
    amountPaid:          0,
    currency:            source.currency,
    items: (source.invoice_items ?? []).map((i: Record<string, unknown>, idx: number) => ({
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

  return createInvoice(dto, createdBy)
}

export async function convertFromQuotation(quotationId: string, createdBy: string) {
  const { data: quotation } = await quotationsRepo.findById(quotationId)
  if (!quotation) throw AppError.notFound('Quotation')

  const dto: CreateInvoiceDto = {
    profileId:       quotation.profile_id,
    loadId:          quotation.load_id ?? null,
    quotationId:     quotation.id,
    status:          'draft',
    issueDate:       new Date().toISOString().slice(0, 10),
    dueDate:         null,
    customerName:    quotation.customer_name,
    customerCompany: quotation.customer_company ?? null,
    customerEmail:   quotation.customer_email ?? null,
    customerPhone:   quotation.customer_phone ?? null,
    billingAddress:  quotation.billing_address ?? null,
    notes:           quotation.notes ?? null,
    terms:           quotation.terms ?? null,
    subtotal:        quotation.subtotal,
    discount:        quotation.discount,
    taxRate:         quotation.tax_rate,
    tax:             quotation.tax,
    total:           quotation.total,
    amountPaid:      0,
    currency:        quotation.currency,
    items: (quotation.quotation_items ?? []).map((i: Record<string, unknown>, idx: number) => ({
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

  return createInvoice(dto, createdBy)
}

export async function generatePdf(id: string) {
  const { data } = await repo.findById(id)
  if (!data) throw AppError.notFound('Invoice')

  const pdfUrl = await generateAndUploadInvoicePdf(data)
  await repo.updatePdfUrl(id, pdfUrl)
  return { pdfUrl }
}
