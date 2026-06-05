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
      entityType: 'shipment',
      entityId,
    })
    .catch(() => undefined)
}

// ── Access: verify user can see / modify this load ────────────────────────────
async function requireLoadAccess(
  loadId:      string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
): Promise<Row> {
  const { data, error } = await supabase
    .from('shipments')
    .select('shipment_id, account_id, assigned_employee_id, created_by')
    .eq('shipment_id', loadId)
    .is('deleted_at', null)
    .single()

  if (error || !data) throw AppError.notFound('Load')
  const load = cast<Row>(data)

  if (!isAdmin) {
    if (companyRole === 'employee') {
      if (load.assigned_employee_id !== userId) {
        throw AppError.forbidden('You do not have access to this load')
      }
    } else {
      const matchesAccount = accountId && load.account_id === accountId
      const isCreator      = userId    && load.created_by  === userId
      if (!matchesAccount && !isCreator) {
        throw AppError.forbidden('You do not have access to this load')
      }
    }
  }
  return load
}

// Determine the "created_by_role" string to store for the event.
function resolveEventRole(
  isAdmin:     boolean,
  companyRole: string | null | undefined,
): string {
  if (isAdmin) return 'admin'
  if (companyRole === 'employee') return 'employee'
  return 'company_admin'
}

// ── List events for a load ────────────────────────────────────────────────────
export async function listEvents(
  loadId:      string,
  query:       ListTrackingEventsQuery,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
) {
  await requireLoadAccess(loadId, isAdmin, accountId, userId, companyRole)
  const { data, count, error } = await trackingRepo.findByLoad(loadId, query)
  if (error) throw AppError.internal('Failed to fetch tracking events')
  return { events: data ?? [], total: count ?? 0 }
}

// ── Get recent events (dashboard) ─────────────────────────────────────────────
export async function getRecentEvents(
  isAdmin:      boolean,
  accountId?:   string | null,
  userId?:      string,
  companyRole?: string | null,
  limit         = 10,
) {
  const { data, error } = await trackingRepo.findRecent(isAdmin, accountId, userId, companyRole, limit)
  if (error) throw AppError.internal('Failed to fetch recent tracking events')
  return data ?? []
}

// ── Get single event ──────────────────────────────────────────────────────────
export async function getEvent(
  id:          string,
  isAdmin:     boolean,
  accountId?:  string | null,
  userId?:     string,
  companyRole?: string | null,
) {
  const { data, error } = await trackingRepo.findById(id)
  if (error || !data) throw AppError.notFound('Tracking event')
  const event = cast<Row>(data)
  await requireLoadAccess(event.load_id as string, isAdmin, accountId, userId, companyRole)
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
  const load = await requireLoadAccess(dto.loadId, isAdmin, accountId, userId, companyRole)

  const { data, error } = await trackingRepo.create({
    load_id:         dto.loadId,
    location_id:     dto.locationId ?? null,
    tracking_status: dto.trackingStatus,
    notes:           dto.notes ?? null,
    created_by:      userId,
    created_by_role: resolveEventRole(isAdmin, companyRole),
    event_timestamp: dto.eventTimestamp ?? new Date().toISOString(),
  })

  if (error) throw AppError.internal('Failed to create tracking event')

  // Notify relevant parties (fire-and-forget)
  const shipLoad = cast<Row>(load)
  const title    = `Tracking update: ${dto.trackingStatus.replace(/_/g, ' ')}`
  const body     = `Load has a new tracking event.`

  // Notify the load creator
  if (shipLoad.created_by && shipLoad.created_by !== userId) {
    notifyUser(shipLoad.created_by as string, title, body, dto.loadId)
  }

  // Notify assigned employee if different from actor
  if (shipLoad.assigned_employee_id && shipLoad.assigned_employee_id !== userId) {
    notifyUser(shipLoad.assigned_employee_id as string, title, body, dto.loadId)
  }

  // Notify company admins if admin created this event
  if (isAdmin && shipLoad.account_id) {
    const { data: companyAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', shipLoad.account_id)
      .eq('company_role', 'company_admin')
    for (const admin of companyAdmins ?? []) {
      notifyUser(admin.id, title, body, dto.loadId)
    }
  }

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

  await requireLoadAccess(event.load_id as string, isAdmin, accountId, userId, companyRole)

  // Ownership check: non-admins can only edit their own events
  if (!isAdmin) {
    const isCreator      = event.created_by === userId
    const isCompanyAdmin = companyRole === 'company_admin'

    // Company admins can edit any event on their loads; employees only own events
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
  if (error || !data) throw AppError.internal('Failed to update tracking event')
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

  await requireLoadAccess(event.load_id as string, isAdmin, accountId, userId, companyRole)

  if (!isAdmin) {
    const isCreator      = event.created_by === userId
    const isCompanyAdmin = companyRole === 'company_admin'
    if (!isCreator && !isCompanyAdmin) {
      throw AppError.forbidden('You can only delete your own tracking events')
    }
  }

  const { error } = await trackingRepo.deleteById(id)
  if (error) throw AppError.internal('Failed to delete tracking event')
}
