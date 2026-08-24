import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as trackingRepo from './tracking.repository'
import * as notificationsService from '../notifications/notifications.service'
import type {
  CreateTrackingEventDto,
  UpdateTrackingEventDto,
  ListTrackingEventsQuery,
} from './tracking.schema'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function cast<T>(r: unknown): T {
  return r as T
}

function notifyUser(
  userId:   string,
  title:    string,
  body:     string,
  entityId: string,
): void {
  void notificationsService
    .createNotification({
      userId,
      type:       'tracking_event_created',
      title,
      body,
      entityType: 'delivery',
      entityId,
    })
    .catch(() => undefined)
}

// ── Access: verify user can see / modify this delivery ────────────────────────────
async function requireDeliveryAccess(
  loadId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
): Promise<Row> {
  const { data, error } = await supabase
    .from('shipments')
    .select('shipment_id, account_id, customer_id, created_by')
    .eq('shipment_id', loadId)
    .is('deleted_at', null)
    .single()

  if (error || !data) throw AppError.notFound('Delivery')
  const delivery = cast<Row>(data)

  if (!isAdmin) {
    if (isResidential) {
      if (delivery.customer_id !== userId) {
        throw AppError.forbidden('You do not have access to this delivery')
      }
    } else {
      // Corporate customers have no employees of their own — one login per account.
      const matchesAccount = accountId && delivery.account_id === accountId
      const isCreator      = userId    && delivery.created_by  === userId
      if (!matchesAccount && !isCreator) {
        throw AppError.forbidden('You do not have access to this delivery')
      }
    }
  }
  return delivery
}

// Determine the "created_by_role" string to store for the event.
function resolveEventRole(isAdmin: boolean): string {
  return isAdmin ? 'admin' : 'company_admin'
}

// ── List events for a delivery ────────────────────────────────────────────────────
export async function listEvents(
  loadId:      string,
  query:       ListTrackingEventsQuery,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
) {
  await requireDeliveryAccess(loadId, isAdmin, accountId, userId, companyRole, isResidential)
  const { data, count, error } = await trackingRepo.findByDelivery(loadId, query)
  if (error) throw AppError.internal('Failed to fetch tracking events', error)
  return { events: data ?? [], total: count ?? 0 }
}

// ── Get recent events (dashboard) ─────────────────────────────────────────────
export async function getRecentEvents(
  isAdmin:      boolean,
  accountId?:   string | null,
  userId?:      string,
  companyRole?: string | null,
  limit         = 10,
  isResidential = false,
) {
  const { data, error } = await trackingRepo.findRecent(isAdmin, accountId, userId, companyRole, limit, isResidential)
  if (error) throw AppError.internal('Failed to fetch recent tracking events', error)
  return data ?? []
}

// ── Get single event ──────────────────────────────────────────────────────────
export async function getEvent(
  id:          string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
  isResidential = false,
) {
  const { data, error } = await trackingRepo.findById(id)
  if (error || !data) throw AppError.notFound('Tracking event')
  const event = cast<Row>(data)
  await requireDeliveryAccess(event.load_id as string, isAdmin, accountId, userId, companyRole, isResidential)
  return event
}

// ── Create event ──────────────────────────────────────────────────────────────
export async function createEvent(
  dto:         CreateTrackingEventDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
) {
  const delivery = await requireDeliveryAccess(dto.loadId, isAdmin, accountId, userId, companyRole)

  const { data, error } = await trackingRepo.create({
    load_id:         dto.loadId,
    location_id:     dto.locationId ?? null,
    tracking_status: dto.trackingStatus,
    notes:           dto.notes ?? null,
    created_by:      userId,
    created_by_role: resolveEventRole(isAdmin),
    event_timestamp: dto.eventTimestamp ?? new Date().toISOString(),
  })

  if (error) throw AppError.internal('Failed to create tracking event', error)

  // Notify relevant parties (fire-and-forget)
  const shipDelivery = cast<Row>(delivery)
  const title    = `Tracking update: ${dto.trackingStatus.replace(/_/g, ' ')}`
  const body     = `Delivery has a new tracking event.`

  // Notify the delivery creator
  if (shipDelivery.created_by && shipDelivery.created_by !== userId) {
    notifyUser(shipDelivery.created_by as string, title, body, dto.loadId)
  }

  // Notify everyone assigned to this delivery, other than the actor
  const { data: assignees } = await supabase
    .from('delivery_assignments')
    .select('employee_id')
    .eq('delivery_id', dto.loadId)
  for (const assignee of assignees ?? []) {
    if (assignee.employee_id !== userId) notifyUser(assignee.employee_id as string, title, body, dto.loadId)
  }

  // Notify company admins if admin created this event
  if (isAdmin && shipDelivery.account_id) {
    const { data: companyAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', shipDelivery.account_id)
      .eq('company_role', 'company_admin')
    for (const admin of companyAdmins ?? []) {
      notifyUser(admin.id, title, body, dto.loadId)
    }
  }

  // Leadership hears about every tracking event, admin-created ones
  // included — excludeUserId just skips the actor's own notification.
  void notificationsService.notifyAllAdmins('tracking_event_created', title, body, 'delivery', dto.loadId, userId)

  return data
}

// ── Update event ──────────────────────────────────────────────────────────────
export async function updateEvent(
  id:          string,
  dto:         UpdateTrackingEventDto,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
) {
  const { data: raw, error: fetchErr } = await trackingRepo.findById(id)
  if (fetchErr || !raw) throw AppError.notFound('Tracking event')
  const event = cast<Row>(raw)

  await requireDeliveryAccess(event.load_id as string, isAdmin, accountId, userId, companyRole)

  // Ownership check: non-admins can only edit their own events
  if (!isAdmin) {
    const isCreator      = event.created_by === userId
    const isCompanyAdmin = companyRole === 'company_admin'

    // Company admins can edit any event on their deliveries; employees only own events
    if (!isCreator && !isCompanyAdmin) {
      throw AppError.forbidden('You can only edit your own tracking events')
    }
  }

  const updates: Record<string, unknown> = {}
  if (dto.locationId     !== undefined) updates.location_id     = dto.locationId
  if (dto.trackingStatus !== undefined) updates.tracking_status = dto.trackingStatus
  if (dto.notes          !== undefined) updates.notes           = dto.notes
  if (dto.eventTimestamp !== undefined) updates.event_timestamp = dto.eventTimestamp

  const { data, error } = await trackingRepo.updateById(id, updates)
  if (error || !data) throw AppError.internal('Failed to update tracking event', error)

  void notificationsService.notifyAllAdmins(
    'tracking_event_updated',
    'Tracking event updated',
    isAdmin ? 'A tracking event was updated.' : 'A corporate updated a tracking event.',
    'delivery',
    event.load_id as string,
    userId,
  )

  return data
}

// ── Delete event ──────────────────────────────────────────────────────────────
export async function deleteEvent(
  id:          string,
  userId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  companyRole?: string | null,
) {
  const { data: raw, error: fetchErr } = await trackingRepo.findById(id)
  if (fetchErr || !raw) throw AppError.notFound('Tracking event')
  const event = cast<Row>(raw)

  await requireDeliveryAccess(event.load_id as string, isAdmin, accountId, userId, companyRole)

  if (!isAdmin) {
    const isCreator      = event.created_by === userId
    const isCompanyAdmin = companyRole === 'company_admin'
    if (!isCreator && !isCompanyAdmin) {
      throw AppError.forbidden('You can only delete your own tracking events')
    }
  }

  const { error } = await trackingRepo.deleteById(id)
  if (error) throw AppError.internal('Failed to delete tracking event', error)

  void notificationsService.notifyAllAdmins(
    'tracking_event_deleted',
    'Tracking event deleted',
    isAdmin ? 'A tracking event was deleted.' : 'A corporate deleted a tracking event.',
    'delivery',
    event.load_id as string,
    userId,
  )
}
