import { Request, Response, NextFunction } from 'express'
import * as levelsService from './service-levels.service'
import { ok, created } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateServiceLevelDto, UpdateServiceLevelDto } from './service-levels.schema'

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await levelsService.listLevels())
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const level = await levelsService.createLevel(req.body as CreateServiceLevelDto)
    created(res, level, 'Service level created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const level = await levelsService.updateLevel(param(req, 'id'), req.body as UpdateServiceLevelDto)
    ok(res, level, 'Service level updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await levelsService.deleteLevel(param(req, 'id'))
    ok(res, null, 'Service level deleted')
  } catch (err) {
    next(err)
  }
}
