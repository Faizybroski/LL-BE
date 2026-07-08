import { Request, Response, NextFunction } from 'express'
import * as accountsService from './accounts.service'
import { ok, created, noContent, paginated, parsePagination } from '../../lib/response'
import { param } from '../../lib/params'
import type {
  CreateAccountDto,
  UpdateAccountDto,
  ListAccountsQuery,
  CreateAccountNoteDto,
  UpdateAccountNoteDto,
  UpdateOwnProfileDto,
  UpdateCompanyLogoDto,
  UpdateOwnCompanyDto,
} from './accounts.schema'

// ── Admin: Accounts ───────────────────────────────────────────────────────────
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req.query)
    const { accounts, total } = await accountsService.listAccounts(
      req.query as unknown as ListAccountsQuery,
    )
    paginated(res, accounts, { page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    next(err)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountsService.getAccount(param(req, 'id'))
    ok(res, account)
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountsService.createAccount(
      req.body as CreateAccountDto,
      req.user!.id,
    )
    created(res, account, 'Account created')
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountsService.updateAccount(
      param(req, 'id'),
      req.body as UpdateAccountDto,
    )
    ok(res, account, 'Account updated')
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await accountsService.deactivateAccount(param(req, 'id'))
    noContent(res)
  } catch (err) {
    next(err)
  }
}

// ── Admin: Account Notes ──────────────────────────────────────────────────────
export async function listNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const notes = await accountsService.listAccountNotes(param(req, 'id'))
    ok(res, notes)
  } catch (err) {
    next(err)
  }
}

export async function createNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const note = await accountsService.createAccountNote(
      param(req, 'id'),
      req.body as CreateAccountNoteDto,
      req.user!.id,
    )
    created(res, note, 'Note added')
  } catch (err) {
    next(err)
  }
}

export async function updateNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const note = await accountsService.updateAccountNote(
      param(req, 'id'),
      param(req, 'noteId'),
      req.body as UpdateAccountNoteDto,
      req.user!.id,
    )
    ok(res, note, 'Note updated')
  } catch (err) {
    next(err)
  }
}

export async function deleteNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await accountsService.deleteAccountNote(param(req, 'id'), param(req, 'noteId'))
    noContent(res)
  } catch (err) {
    next(err)
  }
}

// ── Shipper: own profile ──────────────────────────────────────────────────────
export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await accountsService.getOwnProfile(req.user!.id)
    ok(res, profile)
  } catch (err) {
    next(err)
  }
}

export async function updateMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await accountsService.updateOwnProfile(
      req.user!.id,
      req.body as UpdateOwnProfileDto,
    )
    ok(res, profile, 'Profile updated')
  } catch (err) {
    next(err)
  }
}

export async function updateMyCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountsService.updateOwnCompany(
      req.user!.id,
      req.body as UpdateOwnCompanyDto,
    )
    ok(res, account, 'Company profile updated')
  } catch (err) {
    next(err)
  }
}

export async function myLogoUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = await accountsService.getOwnAccountId(req.user!.id)
    const result    = await accountsService.getLogoUploadUrl(accountId)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

export async function removeMyLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = await accountsService.getOwnAccountId(req.user!.id)
    await accountsService.removeLogo(accountId)
    ok(res, null, 'Company logo removed')
  } catch (err) {
    next(err)
  }
}

export async function updateMyCompanyLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = await accountsService.getOwnAccountId(req.user!.id)
    const account = await accountsService.updateCompanyLogo(
      accountId,
      req.body as UpdateCompanyLogoDto,
    )
    ok(res, account, 'Company logo updated')
  } catch (err) {
    next(err)
  }
}

export async function updateOneCompanyLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountsService.updateCompanyLogo(
      param(req, 'id'),
      req.body as UpdateCompanyLogoDto,
    )
    ok(res, account, 'Company logo updated')
  } catch (err) {
    next(err)
  }
}
