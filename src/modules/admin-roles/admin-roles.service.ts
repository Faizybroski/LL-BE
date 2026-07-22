import { AppError } from '../../lib/errors'
import * as adminRolesRepo from './admin-roles.repository'
import type { AdminRoleValue } from './admin-roles.schema'

// CEO must always retain the ability to manage permissions — otherwise a
// self-lockout would leave no one able to ever re-grant access.
const CEO_LOCKED_PERMISSION = 'employees.manage_permissions'

// ── Get catalog + matrix ──────────────────────────────────────────────────────
export async function getPermissionsMatrix() {
  const [{ data: permissions, error: catalogErr }, { data: matrix, error: matrixErr }] = await Promise.all([
    adminRolesRepo.findPermissionCatalog(),
    adminRolesRepo.findRolePermissionMatrix(),
  ])

  if (catalogErr || !permissions) throw AppError.internal('Failed to fetch permission catalog')
  if (matrixErr || !matrix) throw AppError.internal('Failed to fetch role permission matrix')

  return { permissions, matrix }
}

// ── Toggle a single grant ─────────────────────────────────────────────────────
export async function updateRolePermission(role: AdminRoleValue, permissionKey: string, granted: boolean) {
  if (role === 'ceo' && permissionKey === CEO_LOCKED_PERMISSION && !granted) {
    throw AppError.badRequest('The CEO role must always retain the "Manage Permissions" permission')
  }

  const { data: existing, error: findErr } = await adminRolesRepo.findGrant(role, permissionKey)
  if (findErr || !existing) throw AppError.notFound('Permission')

  const { data, error } = await adminRolesRepo.upsertGrant(role, permissionKey, granted)
  if (error || !data) throw AppError.internal('Failed to update permission')

  return data
}
