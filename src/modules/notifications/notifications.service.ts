import { supabase } from '../../services/supabase.service'
import { AppError } from '../../lib/errors'
import * as notificationsRepo from './notifications.repository'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './notifications.schema'
import type { CreateNotificationDto, MarkReadDto, CreateAlertDto, NotificationType } from './notifications.schema'

export async function getMyNotifications(
  userId: string,
  page: number,
  limit: number,
  unreadOnly: boolean,
  category?: NotificationCategory,
) {
  const types = category ? NOTIFICATION_CATEGORIES[category] : undefined
  const { data, count, error } = await notificationsRepo.findByUser(userId, page, limit, unreadOnly, types, category)
  if (error) throw AppError.internal('Failed to fetch notifications', error)

  const { count: unreadCount } = await notificationsRepo.countUnread(userId)

  return {
    notifications: data ?? [],
    total: count ?? 0,
    unreadCount: unreadCount ?? 0,
  }
}

export async function createNotification(dto: CreateNotificationDto) {
  const { data, error } = await notificationsRepo.create({
    user_id: dto.userId,
    type: dto.type,
    title: dto.title,
    body: dto.body,
    entity_type: dto.entityType,
    entity_id: dto.entityId,
    is_read: false,
  })
  if (error) throw AppError.internal('Failed to create notification', error)
  return data
}

export async function markRead(dto: MarkReadDto, userId: string) {
  const { error } = await notificationsRepo.markAsRead(dto.notificationIds, userId)
  if (error) throw AppError.internal('Failed to mark notifications as read', error)
}

export async function markAllRead(userId: string) {
  const { error } = await notificationsRepo.markAllAsRead(userId)
  if (error) throw AppError.internal('Failed to mark notifications as read', error)
}

// ── Any mutating action → platform leadership ───────────────────────────────────
// Fire-and-forget, same convention as every module-local `notifyUser` helper —
// notifications must never block the caller's main operation.
//
// Deliberately CEO/VP/Manager only, not every admin_role (Assistant/Driver/etc
// would just be noise for things they can't act on) — and never the actor
// themselves (pass excludeUserId so someone doesn't get notified about their
// own change).
const ADMIN_NOTIFY_ROLES = ['ceo', 'vp', 'manager']

export async function notifyAllAdmins(
  type: NotificationType,
  title: string,
  body: string,
  entityType: string,
  entityId: string,
  excludeUserId?: string,
): Promise<void> {
  try {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .in('admin_role', ADMIN_NOTIFY_ROLES)
    if (excludeUserId) query = query.neq('id', excludeUserId)
    const { data: admins } = await query
    if (!admins || admins.length === 0) return

    await notificationsRepo.createMany(
      admins.map((a: { id: string }) => ({
        user_id:     a.id,
        type,
        title,
        body,
        entity_type: entityType,
        entity_id:   entityId,
        is_read:     false,
      })),
    )
  } catch {
    // best-effort — never let a notification failure break the caller's action
  }
}

// ── Admin-authored alerts ──────────────────────────────────────────────────────
// Targets either one company's Company Admin, or every active company's
// Company Admin at once ("Select All"). Reuses the existing notifications
// table — an alert is just a notification row with type 'admin_alert' plus
// severity + category so it renders in the right tab and with a severity badge.
export async function createAlert(dto: CreateAlertDto) {
  const base = {
    type:        'admin_alert' as const,
    title:       dto.title,
    body:        dto.body,
    severity:    dto.severity,
    category:    dto.category,
    entity_type: 'alert',
    is_read:     false,
  }

  if (dto.target === 'account') {
    const { data: admin } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', dto.accountId as string)
      .eq('company_role', 'company_admin')
      .maybeSingle()

    if (!admin) throw AppError.notFound('Company Admin for this corporate')

    const { data, error } = await notificationsRepo.create({ ...base, user_id: admin.id })
    if (error) throw AppError.internal('Failed to create alert', error)
    return { sent: 1, notifications: [data] }
  }

  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'corporate')
    .eq('company_role', 'company_admin')
    .eq('is_active', true)

  if (adminsError) throw AppError.internal('Failed to look up corporates', adminsError)
  if (!admins || admins.length === 0) return { sent: 0, notifications: [] }

  const rows = admins.map((a: { id: string }) => ({ ...base, user_id: a.id }))
  const { data, error } = await notificationsRepo.createMany(rows)
  if (error) throw AppError.internal('Failed to create alerts', error)
  return { sent: rows.length, notifications: data ?? [] }
}
