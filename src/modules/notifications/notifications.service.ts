import { AppError } from '../../lib/errors'
import * as notificationsRepo from './notifications.repository'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './notifications.schema'
import type { CreateNotificationDto, MarkReadDto } from './notifications.schema'

export async function getMyNotifications(
  userId: string,
  page: number,
  limit: number,
  unreadOnly: boolean,
  category?: NotificationCategory,
) {
  const types = category ? NOTIFICATION_CATEGORIES[category] : undefined
  const { data, count, error } = await notificationsRepo.findByUser(userId, page, limit, unreadOnly, types)
  if (error) throw AppError.internal('Failed to fetch notifications')

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
  if (error) throw AppError.internal('Failed to create notification')
  return data
}

export async function markRead(dto: MarkReadDto, userId: string) {
  const { error } = await notificationsRepo.markAsRead(dto.notificationIds, userId)
  if (error) throw AppError.internal('Failed to mark notifications as read')
}

export async function markAllRead(userId: string) {
  const { error } = await notificationsRepo.markAllAsRead(userId)
  if (error) throw AppError.internal('Failed to mark notifications as read')
}
