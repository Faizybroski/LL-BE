import { Request, Response, NextFunction } from 'express'
import * as locationsService from './locations.service'
import { ok, created, noContent, paginated } from '../../lib/response'
import { param } from '../../lib/params'
import type { CreateLocationDto, UpdateLocationDto, ListLocationsQuery } from './locations.schema'

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListLocationsQuery
    const { locations, total } = await locationsService.listLocations(query)
    paginated(res, locations, {
      page:       query.page  ?? 1,
      limit:      query.limit ?? 50,
      total,
      totalPages: Math.ceil(total / (query.limit ?? 50)),
    })
  } catch (err) {
    next(err)
  }
}

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = String(req.query.q ?? '').slice(0, 100)
    const locations = await locationsService.searchLocations(q)
    ok(res, locations)
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await locationsService.getLocation(param(req, 'id'))
    ok(res, location)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await locationsService.createLocation(req.body as CreateLocationDto)
    created(res, location, 'Location created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await locationsService.updateLocation(param(req, 'id'), req.body as UpdateLocationDto)
    ok(res, location, 'Location updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await locationsService.deleteLocation(param(req, 'id'))
    noContent(res)
  } catch (err) {
    next(err)
  }
}
