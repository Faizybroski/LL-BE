import PDFDocument from 'pdfkit'
import { supabase } from './supabase.service'

// ── Types ──────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string
  category:    string
  quantity:    number
  unit:        string
  unit_price:  number
  amount:      number
}

interface QuotationData {
  id:               string
  quotation_number: string
  status:           string
  issue_date:       string
  expiry_date?:     string | null
  customer_name:    string
  customer_company?: string | null
  customer_email?:  string | null
  customer_phone?:  string | null
  billing_address?: string | null
  notes?:           string | null
  terms?:           string | null
  subtotal:         number
  discount:         number
  tax_rate:         number
  tax:              number
  total:            number
  currency:         string
  load_id?:         string | null
  shipments?:       { load_number: string; origin_city: string; destination_city: string } | null
  profiles?:        { full_name: string | null; email: string } | null
  quotation_items?: LineItem[]
}

interface InvoiceData {
  id:                   string
  invoice_number:       string
  status:               string
  issue_date:           string
  due_date?:            string | null
  customer_name:        string
  customer_company?:    string | null
  customer_email?:      string | null
  customer_phone?:      string | null
  billing_address?:     string | null
  notes?:               string | null
  terms?:               string | null
  payment_instructions?: string | null
  subtotal:             number
  discount:             number
  tax_rate:             number
  tax:                  number
  total:                number
  amount_paid:          number
  balance_due:          number
  currency:             string
  shipments?:           { load_number: string; origin_city: string; destination_city: string } | null
  profiles?:            { full_name: string | null; email: string } | null
  invoice_items?:       LineItem[]
}

// ── Colours / metrics ──────────────────────────────────────────────────────────

const BRAND    = '#C89B3C'
const DARK     = '#1A1A2E'
const GREY     = '#6B7280'
const LIGHT_BG = '#F9FAFB'
const BORDER   = '#E5E7EB'
const PAGE_W   = 595.28   // A4 pt
const PAGE_H   = 841.89
const MARGIN   = 50
const COL_W    = PAGE_W - MARGIN * 2

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(n)
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function categoryLabel(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── PDF builder helpers ───────────────────────────────────────────────────────

function drawHRule(doc: InstanceType<typeof PDFDocument>, y: number, color = BORDER) {
  doc.save().strokeColor(color).lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore()
}

function header(
  doc: InstanceType<typeof PDFDocument>,
  docNumber: string,
  docLabel: string,
  statusText: string,
  issuedLabel: string,
  issuedDate: string,
  secondaryLabel: string,
  secondaryDate: string,
) {
  // Brand bar
  doc.rect(0, 0, PAGE_W, 8).fill(BRAND)

  // Company block (left)
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(18).text('Logical Links', MARGIN, 30)
  doc.fillColor(GREY).font('Helvetica').fontSize(9)
    .text('Freight & Logistics', MARGIN, 52)
    .text('logistics@logicallinks.com.au', MARGIN, 65)

  // Document title (right)
  const titleX = PAGE_W - MARGIN - 200
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(26).text(docLabel, titleX, 24, { width: 200, align: 'right' })

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
    .text(docNumber, titleX, 58, { width: 200, align: 'right' })

  // Status badge
  doc.roundedRect(titleX + 130, 73, 70, 18, 9).fill(BRAND)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
    .text(statusText.toUpperCase(), titleX + 130, 77, { width: 70, align: 'center' })

  drawHRule(doc, 100)

  // Dates row
  doc.fillColor(GREY).font('Helvetica').fontSize(8).text(issuedLabel, MARGIN, 112)
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text(issuedDate, MARGIN, 123)

  doc.fillColor(GREY).font('Helvetica').fontSize(8).text(secondaryLabel, MARGIN + 130, 112)
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text(secondaryDate, MARGIN + 130, 123)

  return 150
}

function customerSection(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  data: { customer_name: string; customer_company?: string | null; customer_email?: string | null; customer_phone?: string | null; billing_address?: string | null },
  load?: { load_number: string; origin_city: string; destination_city: string } | null,
) {
  doc.rect(MARGIN, y, COL_W, 10).fill(LIGHT_BG)
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('BILL TO', MARGIN + 4, y + 1.5)
  y += 14

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(data.customer_name, MARGIN, y)
  y += 14
  if (data.customer_company) {
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(data.customer_company, MARGIN, y)
    y += 12
  }
  if (data.customer_email) {
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(data.customer_email, MARGIN, y)
    y += 12
  }
  if (data.customer_phone) {
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(data.customer_phone, MARGIN, y)
    y += 12
  }
  if (data.billing_address) {
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(data.billing_address, MARGIN, y, { width: 200 })
    y += doc.heightOfString(data.billing_address, { width: 200 }) + 4
  }

  if (load) {
    const lx = MARGIN + 280
    doc.rect(lx, y - 60, 215, 60).fill(LIGHT_BG)
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('LOAD REFERENCE', lx + 4, y - 56)
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(load.load_number, lx + 4, y - 44)
    doc.fillColor(GREY).font('Helvetica').fontSize(9)
      .text(`${load.origin_city} → ${load.destination_city}`, lx + 4, y - 30)
  }

  y += 16
  drawHRule(doc, y)
  return y + 12
}

function lineItemsTable(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  items: LineItem[],
  currency: string,
) {
  const colDesc  = MARGIN
  const colCat   = MARGIN + 190
  const colQty   = MARGIN + 310
  const colPrice = MARGIN + 370
  const colAmt   = MARGIN + 435

  // Table header
  doc.rect(MARGIN, y, COL_W, 18).fill(DARK)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
    .text('DESCRIPTION',   colDesc + 4, y + 5,  { width: 185 })
    .text('CATEGORY',      colCat,       y + 5,  { width: 115 })
    .text('QTY',           colQty,       y + 5,  { width: 55,  align: 'right' })
    .text('UNIT PRICE',    colPrice,     y + 5,  { width: 60,  align: 'right' })
    .text('AMOUNT',        colAmt,       y + 5,  { width: 60,  align: 'right' })
  y += 18

  items.forEach((item, idx) => {
    const rowH = Math.max(
      24,
      doc.heightOfString(item.description, { width: 182 }) + 10,
    )

    if (y + rowH > PAGE_H - 120) {
      doc.addPage()
      y = MARGIN
    }

    if (idx % 2 === 0) doc.rect(MARGIN, y, COL_W, rowH).fill('#F9FAFB')

    doc.fillColor(DARK).font('Helvetica').fontSize(9)
      .text(item.description, colDesc + 4, y + 5, { width: 182 })

    doc.fillColor(GREY).font('Helvetica').fontSize(8)
      .text(categoryLabel(item.category), colCat, y + 5, { width: 115 })
      .text(`${item.quantity} ${item.unit}`, colQty, y + 5, { width: 55, align: 'right' })

    doc.fillColor(DARK).font('Helvetica').fontSize(9)
      .text(fmt(item.unit_price, currency), colPrice, y + 5, { width: 60, align: 'right' })
      .text(fmt(item.amount, currency),     colAmt,   y + 5, { width: 60, align: 'right' })

    drawHRule(doc, y + rowH, BORDER)
    y += rowH
  })

  return y + 8
}

function totalsSection(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  subtotal: number,
  discount: number,
  tax: number,
  taxRate: number,
  total: number,
  currency: string,
  extraRows?: { label: string; value: number; bold?: boolean }[],
) {
  const totW = 220
  const totX = PAGE_W - MARGIN - totW

  function row(label: string, value: string, bold = false) {
    doc.fillColor(bold ? DARK : GREY).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      .text(label, totX, y, { width: totW / 2 })
    doc.fillColor(bold ? DARK : GREY).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      .text(value, totX + totW / 2, y, { width: totW / 2, align: 'right' })
    y += 16
  }

  row('Subtotal', fmt(subtotal, currency))
  if (discount > 0) row('Discount', `-${fmt(discount, currency)}`)
  if (tax > 0)      row(`Tax (${Math.round(taxRate * 100)}%)`, fmt(tax, currency))

  if (extraRows) extraRows.forEach((r) => row(r.label, fmt(r.value, currency), r.bold))

  drawHRule(doc, y, BRAND)
  y += 6

  doc.rect(totX, y, totW, 24).fill(BRAND)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(11)
    .text('TOTAL', totX + 8, y + 6, { width: totW / 2 })
    .text(fmt(total, currency), totX + totW / 2, y + 6, { width: totW / 2 - 8, align: 'right' })
  y += 30

  return y
}

function notesSection(doc: InstanceType<typeof PDFDocument>, y: number, notes?: string | null, terms?: string | null, extra?: string | null) {
  if (!notes && !terms && !extra) return y

  y += 12
  drawHRule(doc, y)
  y += 10

  if (notes) {
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('NOTES', MARGIN, y)
    y += 12
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(notes, MARGIN, y, { width: COL_W })
    y += doc.heightOfString(notes, { width: COL_W }) + 10
  }
  if (terms) {
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('TERMS & CONDITIONS', MARGIN, y)
    y += 12
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(terms, MARGIN, y, { width: COL_W })
    y += doc.heightOfString(terms, { width: COL_W }) + 10
  }
  if (extra) {
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('PAYMENT INSTRUCTIONS', MARGIN, y)
    y += 12
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(extra, MARGIN, y, { width: COL_W })
    y += doc.heightOfString(extra, { width: COL_W }) + 10
  }

  return y
}

function pageFooter(doc: InstanceType<typeof PDFDocument>, pageNum: number, total: number) {
  const y = PAGE_H - 30
  doc.rect(0, y - 4, PAGE_W, 34).fill(LIGHT_BG)
  doc.fillColor(GREY).font('Helvetica').fontSize(8)
    .text('Logical Links — logistics@logicallinks.com.au', MARGIN, y + 4)
    .text(`Page ${pageNum} of ${total}`, 0, y + 4, { width: PAGE_W - MARGIN, align: 'right' })
}

// ── Buffer helpers ────────────────────────────────────────────────────────────

function buildPdfBuffer(cb: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    cb(doc)
    doc.end()
  })
}

async function uploadToStorage(buffer: Buffer, path: string): Promise<string> {
  const { error } = await supabase.storage.from('documents').upload(path, buffer, {
    contentType: 'application/pdf',
    upsert:      true,
  })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from('documents').getPublicUrl(path)
  return data.publicUrl
}

// ── Quotation PDF ─────────────────────────────────────────────────────────────

export async function generateAndUploadQuotationPdf(data: QuotationData): Promise<string> {
  const items = data.quotation_items ?? []

  const buffer = await buildPdfBuffer((doc) => {
    let y = header(
      doc,
      data.quotation_number,
      'QUOTATION',
      data.status,
      'Issue Date',
      fmtDate(data.issue_date),
      'Expiry Date',
      fmtDate(data.expiry_date),
    )

    y = customerSection(doc, y, data, data.shipments ?? null)
    y = lineItemsTable(doc, y, items, data.currency)
    y = totalsSection(doc, y, data.subtotal, data.discount, data.tax, data.tax_rate, data.total, data.currency)
    y = notesSection(doc, y, data.notes, data.terms)

    // Signature area
    if (y < PAGE_H - 140) {
      y += 20
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('AUTHORIZED SIGNATURE', MARGIN, y)
      y += 12
      drawHRule(doc, y + 30, DARK)
      doc.fillColor(GREY).font('Helvetica').fontSize(8).text('Signature', MARGIN, y + 34)

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text('CUSTOMER ACCEPTANCE', MARGIN + 250, y)
      drawHRule(doc, y + 30, DARK)
      doc.fillColor(GREY).font('Helvetica').fontSize(8).text('Signature & Date', MARGIN + 250, y + 34)
    }

    pageFooter(doc, 1, 1)
  })

  return uploadToStorage(buffer, `quotations/${data.id}.pdf`)
}

// ── Invoice PDF ───────────────────────────────────────────────────────────────

export async function generateAndUploadInvoicePdf(data: InvoiceData): Promise<string> {
  const items = data.invoice_items ?? []

  const buffer = await buildPdfBuffer((doc) => {
    let y = header(
      doc,
      data.invoice_number,
      'INVOICE',
      data.status,
      'Issue Date',
      fmtDate(data.issue_date),
      'Due Date',
      fmtDate(data.due_date),
    )

    y = customerSection(doc, y, data, data.shipments ?? null)
    y = lineItemsTable(doc, y, items, data.currency)
    y = totalsSection(doc, y, data.subtotal, data.discount, data.tax, data.tax_rate, data.total, data.currency, [
      { label: 'Amount Paid', value: data.amount_paid },
      { label: 'Balance Due', value: data.balance_due, bold: true },
    ])
    y = notesSection(doc, y, data.notes, data.terms, data.payment_instructions ?? null)

    pageFooter(doc, 1, 1)
  })

  return uploadToStorage(buffer, `invoices/${data.id}.pdf`)
}

// ── Terms & Conditions PDF ──────────────────────────────────────────────────────
// Static legal document, not tied to a specific quotation/invoice — generated
// on demand for the "Download PDF" action in the acceptance modal, never stored.

export const TERMS_VERSION = '1.0'

const TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. Agreement',
    body: 'By accepting a quotation, the Client agrees to these Terms and Conditions.',
  },
  {
    heading: '2. Definitions',
    body: '"Company" refers to the service provider. "Client" refers to the party accepting the quotation. "Services" refers to all work described in the quotation.',
  },
  {
    heading: '3. Scope of Services',
    body: 'Services are limited strictly to the accepted quotation. Any additional work requires written approval and may incur additional charges.',
  },
  {
    heading: '4. Pricing & Payment',
    body: 'Pricing is as stated in the quotation. Payment terms apply as specified. Late payments may result in suspension of services.',
  },
  {
    heading: '5. Changes & Cancellations',
    body: 'Any changes or cancellations may result in charges for work already performed or committed resources.',
  },
  {
    heading: '6. Client Responsibilities',
    body: 'The Client is responsible for providing accurate information and ensuring compliance of any goods, instructions, or data provided for execution of services.',
  },
  {
    heading: '7. Liability',
    body: 'To the maximum extent permitted by applicable law, total liability is limited to the amount paid for the specific quotation. The Company is not liable for indirect, incidental, or consequential damages.',
  },
  {
    heading: '8. No Warranty',
    body: 'Services are provided without warranties of any kind unless expressly stated in writing.',
  },
  {
    heading: '9. Force Majeure',
    body: 'The Company is not liable for delays or failure caused by events beyond reasonable control.',
  },
  {
    heading: '10. Data & Audit Records',
    body: 'The Company may record acceptance details including user identity, company, timestamp, IP address, and Terms version for audit and compliance purposes.',
  },
  {
    heading: '11. Intellectual Property',
    body: 'Unless otherwise agreed in writing, all Company systems, methods, and materials remain the property of the Company.',
  },
  {
    heading: '12. Governing Law',
    body: 'These Terms are governed by the laws of Ontario and Canada.',
  },
  {
    heading: '13. Entire Agreement',
    body: 'These Terms, together with the accepted quotation, constitute the entire agreement between the parties.',
  },
]

export async function generateTermsPdfBuffer(): Promise<Buffer> {
  return buildPdfBuffer((doc) => {
    const width = PAGE_W - MARGIN * 2
    let y = MARGIN

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(16)
      .text('LOGICAL LINKS MASTER TERMS & CONDITIONS', MARGIN, y, { width })
    y = doc.y + 6

    doc.fillColor(GREY).font('Helvetica').fontSize(9)
      .text(`Version: ${TERMS_VERSION}    Effective Date: June 23, 2026`, MARGIN, y, { width })
    y = doc.y + 20

    for (const section of TERMS_SECTIONS) {
      if (y > PAGE_H - 100) {
        doc.addPage()
        y = MARGIN
      }
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(section.heading, MARGIN, y, { width })
      y = doc.y + 4
      doc.fillColor(DARK).font('Helvetica').fontSize(9.5).text(section.body, MARGIN, y, { width, lineGap: 2 })
      y = doc.y + 14
    }
  })
}
