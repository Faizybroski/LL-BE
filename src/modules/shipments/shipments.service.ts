import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as shipmentsRepo from './shipments.repository'
import * as notificationsService from '../notifications/notifications.service'
import {
  STATUS_TRANSITIONS,
  DELETABLE_STATUSES,
  type ShipmentStatus,
  type CreateShipmentDto,
  type UpdateShipmentDto,
  type UpdateShipmentStatusDto,
  type DeleteShipmentDto,
  type AssignShipmentDto,
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

function assertTransition(current: ShipmentStatus, next: ShipmentStatus): void {
  if (!STATUS_TRANSITIONS[current]?.includes(next)) {
    throw AppError.unprocessable(
      `Cannot transition from '${current}' to '${next}'. ` +
      `Allowed next states: ${STATUS_TRANSITIONS[current]?.join(', ') || 'none (terminal state)'}`,
    )
  }
}

// ── Access guard ──────────────────────────────────────────────────────────────
// A shipper can access a shipment if:
//   a) it belongs to their account (account_id match), OR
//   b) they created it (created_by match — covers pending loads not yet assigned)
// Admins always have full access.
async function requireShipmentAccess(
  id:        string,
  isAdmin:   boolean,
  accountId?: string | null,
  userId?:   string,
): Promise<ShipmentRow> {
  const { data, error } = await shipmentsRepo.findById(id)
  if (error || !data) throw AppError.notFound('Shipment')

  const shipment = cast<ShipmentRow>(data)

  if (!isAdmin) {
    const matchesAccount = accountId && shipment.account_id === accountId
    const isCreator      = userId    && shipment.created_by  === userId
    if (!matchesAccount && !isCreator) {
      throw AppError.forbidden('You do not have access to this shipment')
    }
  }

  return shipment
}

// ── List ──────────────────────────────────────────────────────────────────────
export async function listShipments(
  query:     ListShipmentsQuery,
  isAdmin:   boolean,
  accountId?: string | null,
  userId?:   string,
) {
  const { data, count, error } = await shipmentsRepo.findAll(query, accountId, isAdmin, userId)
  if (error) throw AppError.internal('Failed to fetch shipments')
  return { shipments: data ?? [], total: count ?? 0 }
}

// ── Get one ───────────────────────────────────────────────────────────────────
export async function getShipment(
  id:        string,
  isAdmin:   boolean,
  accountId?: string | null,
  userId?:   string,
) {
  const shipment = await requireShipmentAccess(id, isAdmin, accountId, userId)
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
    // Shipper creates load → auto-assign to themselves (look up their account)
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', createdBy)
      .single()
    resolvedAccountId = profile?.account_id ?? null
  } else if (dto.shipperId) {
    // Admin explicitly assigns to a shipper
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', dto.shipperId)
      .eq('role', 'shipper')
      .single()
    if (profileErr || !profile) throw AppError.notFound('Shipper user')
    resolvedAccountId = profile.account_id ?? null
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
  id:        string,
  dto:       UpdateShipmentDto,
  isAdmin:   boolean,
  accountId?: string | null,
  userId?:   string,
) {
  await requireShipmentAccess(id, isAdmin, accountId, userId)

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
  id:        string,
  dto:       UpdateShipmentStatusDto,
  userId:    string,
  isAdmin:   boolean,
  accountId?: string | null,
) {
  const shipment      = await requireShipmentAccess(id, isAdmin, accountId, userId)
  const currentStatus = shipment.status as ShipmentStatus

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

// ── Assign to shipper ─────────────────────────────────────────────────────────
// Admin-only. Shipment must be 'confirmed' and not shipper-owned. Accepts the
// shipper's USER id, looks up their account_id, sets it on the shipment and
// advances status to 'assigned'.
export async function assignToShipper(
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
      'This load was created by a shipper and its assignment is permanently locked. Reassignment is not permitted.',
    )
  }

  if (currentStatus !== 'confirmed') {
    throw AppError.unprocessable(
      `Shipment must be 'confirmed' before assigning a shipper. Current status: '${currentStatus}'`,
    )
  }

  // Resolve the shipper user → their account
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('account_id, full_name')
    .eq('id', dto.userId)
    .eq('role', 'shipper')
    .single()

  if (profileErr || !profile) throw AppError.notFound('Shipper user')
  if (!profile.account_id) throw AppError.unprocessable('This shipper has no associated account')

  // Verify account is active
  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('account_id, account_name, is_active')
    .eq('account_id', profile.account_id)
    .single()

  if (accountErr || !account) throw AppError.notFound('Shipper account')
  if (!account.is_active) throw AppError.unprocessable('Cannot assign to an inactive shipper account')

  const targetAccountId = profile.account_id

  const { data, error } = await shipmentsRepo.updateById(shipmentId, {
    account_id: targetAccountId,
    status:     'assigned',
  })
  if (error || !data) throw AppError.internal('Failed to assign shipment')

  // Notify the assigned shipper user
  notifyUser(
    dto.userId,
    'shipment_assigned',
    'Load assigned to you',
    `Load has been assigned to you.`,
    shipmentId,
  )

  return data
}

// ── Soft delete ───────────────────────────────────────────────────────────────
export async function deleteShipment(
  id:        string,
  dto:       DeleteShipmentDto,
  userId:    string,
  isAdmin:   boolean,
  accountId?: string | null,
) {
  const shipment      = await requireShipmentAccess(id, isAdmin, accountId, userId)
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
