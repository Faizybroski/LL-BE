import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as shipmentsRepo from './shipments.repository'
import * as notificationsService from '../notifications/notifications.service'
import {
  SHIPMENT_STATUSES,
  STATUS_TRANSITIONS,
  DELETABLE_STATUSES,
  type ShipmentStatus,
  type CreateShipmentDto,
  type UpdateShipmentDto,
  type UpdateShipmentStatusDto,
  type DeleteShipmentDto,
  type AssignShipmentDto,
  type AssignEmployeeDto,
  type ListShipmentsQuery,
} from './shipments.schema'

// ── Helpers ───────────────────────────────────────────────────────────────────

function cast<T>(record: unknown): T {
  return record as T
}

// Fire-and-forget — notifications must never block the main operation.
function notifyUser(
  userId:   string,
  type:     'shipment_assigned' | 'shipment_picked_up' | 'shipment_in_transit' | 'shipment_out_for_delivery' | 'shipment_delivered' | 'shipment_cancelled',
  title:    string,
  body:     string,
  entityId: string,
): void {
  void notificationsService
    .createNotification({ userId, type, title, body, entityType: 'shipment', entityId })
    .catch(() => undefined)
}

type ShipmentRow = Record<string, unknown>

const TERMINAL_STATUSES = new Set<string>(['delivered', 'cancelled'])

function assertTransition(current: string, next: string): void {
  // Terminal system statuses are absolute — no transition out of them
  if (TERMINAL_STATUSES.has(current)) {
    throw AppError.unprocessable(
      `Cannot change status: '${current}' is a terminal state`,
    )
  }

  // Both current and next are system statuses → enforce the state machine
  const isCurrentSystem = SHIPMENT_STATUSES.includes(current as ShipmentStatus)
  const isNextSystem    = SHIPMENT_STATUSES.includes(next as ShipmentStatus)

  if (isCurrentSystem && isNextSystem) {
    if (!STATUS_TRANSITIONS[current as ShipmentStatus]?.includes(next as ShipmentStatus)) {
      throw AppError.unprocessable(
        `Cannot transition from '${current}' to '${next}'. ` +
        `Allowed: ${STATUS_TRANSITIONS[current as ShipmentStatus]?.join(', ') || 'none'}`,
      )
    }
  }
  // Current or next is a custom status → allow (informational update)
}

// ── Access guard ──────────────────────────────────────────────────────────────
// Admins: full access.
// Company admins: shipments belonging to their account OR created by them.
// Employees: only shipments explicitly assigned to them.
async function requireShipmentAccess(
  id:          string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
): Promise<ShipmentRow> {
  const { data, error } = await shipmentsRepo.findById(id)
  if (error || !data) throw AppError.notFound('Shipment')

  const shipment = cast<ShipmentRow>(data)

  if (!isAdmin) {
    if (companyRole === 'employee') {
      // Employees can only access shipments assigned directly to them
      if (shipment.assigned_employee_id !== userId) {
        throw AppError.forbidden('You do not have access to this shipment')
      }
    } else {
      // Company admins: must match on account or be the creator
      const matchesAccount = accountId && shipment.account_id === accountId
      const isCreator      = userId    && shipment.created_by  === userId
      if (!matchesAccount && !isCreator) {
        throw AppError.forbidden('You do not have access to this shipment')
      }
    }
  }

  return shipment
}

// ── List ──────────────────────────────────────────────────────────────────────
export async function listShipments(
  query:       ListShipmentsQuery,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
) {
  const { data, count, error } = await shipmentsRepo.findAll(query, accountId, isAdmin, userId, companyRole)
  if (error) throw AppError.internal('Failed to fetch shipments')
  return { shipments: data ?? [], total: count ?? 0 }
}

// ── Get one ───────────────────────────────────────────────────────────────────
export async function getShipment(
  id:          string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
) {
  const shipment = await requireShipmentAccess(id, isAdmin, accountId, userId, companyRole)
  const { data: history } = await shipmentsRepo.findStatusHistory(id)
  return { ...shipment, statusHistory: history ?? [] }
}

// ── Create ────────────────────────────────────────────────────────────────────
export async function createShipment(
  dto:         CreateShipmentDto,
  createdBy:   string,
  creatorRole: 'admin' | 'shipper',
) {
  let resolvedAccountId: string | null = null

  if (creatorRole === 'shipper') {
    // Shipping company creates load → auto-assign to their account
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', createdBy)
      .single()
    resolvedAccountId = profile?.account_id ?? null
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

  const { data, error } = await shipmentsRepo.create({
    shipment_type:    dto.shipmentType,
    account_id:       resolvedAccountId,
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
    reference_number:     dto.referenceNumber ?? null,

    status:     'pending' as ShipmentStatus,
    created_by: createdBy,
  })

  if (error) {console.error(error)
    throw AppError.internal('Failed to create shipment')}
  return data
}

// ── Update ────────────────────────────────────────────────────────────────────
export async function updateShipment(
  id:          string,
  dto:         UpdateShipmentDto,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
) {
  await requireShipmentAccess(id, isAdmin, accountId, userId, companyRole)

  // Shippers cannot touch financial or actual-event fields.
  if (!isAdmin) {
    const adminOnlyFields: (keyof UpdateShipmentDto)[] = [
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

  const { data, error } = await shipmentsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update shipment')
  return data
}

// ── Status transition ─────────────────────────────────────────────────────────
export async function updateStatus(
  id:          string,
  dto:         UpdateShipmentStatusDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
) {
  const shipment      = await requireShipmentAccess(id, isAdmin, accountId, userId, companyRole)
  const currentStatus = shipment.status as string

  assertTransition(currentStatus, dto.status)

  // All valid transitions are permitted for any user who passes requireShipmentAccess.
  // Access is already scoped: shippers can only reach their own shipments (account_id
  // match or created_by match). No further per-status role restriction is needed.

  const updates: Record<string, unknown> = { status: dto.status }
  if (dto.status === 'picked_up') {
    updates.actual_pickup_date = new Date().toISOString()
  }
  if (dto.status === 'delivered') {
    updates.actual_delivery_date = new Date().toISOString()
  }

  const { data, error } = await shipmentsRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update status')

  if (dto.reason || userId !== (shipment.created_by as string)) {
    await shipmentsRepo.insertStatusHistoryEntry({
      shipmentId: id,
      oldStatus:  currentStatus,
      newStatus:  dto.status,
      changedBy:  userId,
      reason:     dto.reason,
    })
  }

  const creatorId = shipment.created_by as string
  if (dto.status === 'picked_up') {
    notifyUser(creatorId, 'shipment_picked_up', 'Shipment picked up', 'Your shipment has been picked up.', id)
  } else if (dto.status === 'in_transit') {
    notifyUser(creatorId, 'shipment_in_transit', 'Shipment in transit', 'Your shipment is now in transit.', id)
  } else if (dto.status === 'out_for_delivery') {
    notifyUser(creatorId, 'shipment_out_for_delivery', 'Out for delivery', 'Your shipment is out for delivery.', id)
  } else if (dto.status === 'delivered') {
    notifyUser(creatorId, 'shipment_delivered', 'Shipment delivered', 'Your shipment has been delivered.', id)
  } else if (dto.status === 'cancelled') {
    notifyUser(creatorId, 'shipment_cancelled', 'Shipment cancelled', 'Your shipment has been cancelled.', id)
  }

  return data
}

// Statuses where company assignment is locked (operational work has started).
const ASSIGNMENT_LOCKED_STATUSES: ShipmentStatus[] = [
  'confirmed', 'assigned', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled',
]

// ── Assign to Shipping Company (admin-only) ───────────────────────────────────
// Admin assigns or reassigns a pending, admin-created load to a shipping company.
// Assignment is locked once status advances to 'confirmed' or beyond.
export async function assignToCompany(
  shipmentId: string,
  dto:        AssignShipmentDto,
  assignedBy: string,
) {
  const { data: raw, error: fetchErr } = await shipmentsRepo.findById(shipmentId)
  if (fetchErr || !raw) throw AppError.notFound('Shipment')

  const shipment      = cast<ShipmentRow>(raw)
  const currentStatus = shipment.status as ShipmentStatus

  if (shipment.created_by_role === 'shipper') {
    throw AppError.forbidden(
      'This load was created by a shipping company and its assignment is permanently locked. Reassignment is not permitted.',
    )
  }

  if (ASSIGNMENT_LOCKED_STATUSES.includes(currentStatus)) {
    throw AppError.unprocessable(
      `This load cannot be reassigned because operational processing has already started. Current status: '${currentStatus}'.`,
    )
  }

  // Verify the target company exists and is active
  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('account_id, account_name, is_active')
    .eq('account_id', dto.accountId)
    .single()

  if (accountErr || !account) throw AppError.notFound('Shipping company')
  if (!account.is_active) throw AppError.unprocessable('Cannot assign to an inactive shipping company')

  const { data, error } = await shipmentsRepo.updateById(shipmentId, {
    account_id: dto.accountId,
  })
  if (error || !data) throw AppError.internal('Failed to assign shipment')

  // Notify all company admins of the assignment
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('account_id', dto.accountId)
    .eq('company_role', 'company_admin')

  for (const admin of admins ?? []) {
    notifyUser(admin.id, 'shipment_assigned', 'Load assigned to your company', `Load has been assigned to ${account.account_name}.`, shipmentId)
  }

  return data
}

// ── Assign to Employee (company-admin-only) ────────────────────────────────────
// Company admin assigns (or unassigns) a load to an employee within the same company.
export async function assignToEmployee(
  shipmentId:     string,
  dto:            AssignEmployeeDto,
  companyAdminId: string,
  accountId:      string,
) {
  const { data: raw, error: fetchErr } = await shipmentsRepo.findById(shipmentId)
  if (fetchErr || !raw) throw AppError.notFound('Shipment')

  const shipment = cast<ShipmentRow>(raw)

  // Verify the load belongs to this company
  if (shipment.account_id !== accountId) {
    throw AppError.forbidden('This load does not belong to your company')
  }

  if (dto.employeeId !== null) {
    // Verify the employee belongs to the same company
    const { data: employee, error: empErr } = await supabase
      .from('profiles')
      .select('id, full_name, account_id, company_role')
      .eq('id', dto.employeeId)
      .eq('account_id', accountId)
      .eq('company_role', 'employee')
      .single()

    if (empErr || !employee) {
      throw AppError.notFound('Employee not found in your company')
    }

    notifyUser(dto.employeeId, 'shipment_assigned', 'Load assigned to you', 'A load has been assigned to you.', shipmentId)
  }

  const { data, error } = await shipmentsRepo.updateById(shipmentId, {
    assigned_employee_id: dto.employeeId,
  })
  if (error || !data) throw AppError.internal('Failed to assign employee')

  return data
}

// ── Soft delete ───────────────────────────────────────────────────────────────
export async function deleteShipment(
  id:          string,
  dto:         DeleteShipmentDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
) {
  const shipment      = await requireShipmentAccess(id, isAdmin, accountId, userId, companyRole)
  const currentStatus = shipment.status as ShipmentStatus

  if (!DELETABLE_STATUSES.includes(currentStatus)) {
    throw AppError.unprocessable(
      `Only shipments in ${DELETABLE_STATUSES.map((s) => `'${s}'`).join(' or ')} ` +
      `status can be deleted. Current status: '${currentStatus}'`,
    )
  }

  await shipmentsRepo.insertStatusHistoryEntry({
    shipmentId: id,
    oldStatus:  currentStatus,
    newStatus:  'cancelled',
    changedBy:  userId,
    reason:     `[DELETED] ${dto.reason}`,
  })

  const { error } = await shipmentsRepo.softDeleteById(id)
  if (error) throw AppError.internal('Failed to delete shipment')
}
