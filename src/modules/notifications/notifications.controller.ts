import { Request, Response, NextFunction } from 'express'
import * as notificationsService from './notifications.service'
import { ok, noContent, parsePagination } from '../../lib/response'
import type { MarkReadDto } from './notifications.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const unreadOnly = req.query['unreadOnly'] === 'true'
    const result = await notificationsService.getMyNotifications(req.user!.id, page, limit, unreadOnly)
    res.status(200).json({
      success: true,
      data: result.notifications,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
        unreadCount: result.unreadCount,
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await notificationsService.markRead(req.body as MarkReadDto, req.user!.id)
    noContent(res)
  } catch (err) {
    next(err)
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await notificationsService.markAllRead(req.user!.id)
    ok(res, null, 'All notifications marked as read')
  } catch (err) {
    next(err)
  }
}
