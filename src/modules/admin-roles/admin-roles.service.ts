import { AppError } from '../../lib/errors'
import * as adminRolesRepo from './admin-roles.repository'
import type { AdminRoleValue } from './admin-roles.schema'

// CEO must always retain the ability to manage permissions — otherwise a
// self-lockout would leave no one able to ever re-grant access.
const CEO_LOCKED_PERMISSION = 'employees.manage_permissions'

// ── Get catalog + matrix ──────────────────────────────────────────────────────
export async function getPermissionsMatrix() {
  const [{ data: permissions, error: catalogErr }, { data: matrix, error: matrixErr }, { data: roles, error: rolesErr }] = await Promise.all([
    adminRolesRepo.findPermissionCatalog(),
    adminRolesRepo.findRolePermissionMatrix(),
    adminRolesRepo.findAllRoles(),
  ])

  if (catalogErr || !permissions) throw AppError.internal('Failed to fetch permission catalog', catalogErr)
  if (matrixErr || !matrix) throw AppError.internal('Failed to fetch role permission matrix', matrixErr)
  if (rolesErr || !roles) throw AppError.internal('Failed to fetch role list', rolesErr)

  return { permissions, matrix, roles }
}

// ── Toggle a single grant ─────────────────────────────────────────────────────
export async function updateRolePermission(role: AdminRoleValue, permissionKey: string, granted: boolean) {
  if (role === 'ceo' && permissionKey === CEO_LOCKED_PERMISSION && !granted) {
    throw AppError.badRequest('The CEO role must always retain the "Manage Permissions" permission')
  }

  const { data: existing, error: findErr } = await adminRolesRepo.findGrant(role, permissionKey)
  if (findErr || !existing) throw AppError.notFound('Permission')

  const { data, error } = await adminRolesRepo.upsertGrant(role, permissionKey, granted)
  if (error || !data) throw AppError.internal('Failed to update permission', error)

  return data
}

// ── Role CRUD ──────────────────────────────────────────────────────────────────

export async function listRoles() {
  const { data, error } = await adminRolesRepo.findAllRoles()
  if (error || !data) throw AppError.internal('Failed to fetch roles', error)
  return data
}

export async function createRole(slug: string, label: string) {
  const { data: existing } = await adminRolesRepo.findRoleBySlug(slug)
  if (existing) throw AppError.badRequest(`A role with slug "${slug}" already exists`)

  const { count } = await adminRolesRepo.countRoles()
  const nextSortOrder = (count ?? 0) + 1

  const { data, error } = await adminRolesRepo.insertRole(slug, label, nextSortOrder)
  if (error || !data) throw AppError.internal('Failed to create role', error)

  const { error: grantErr } = await adminRolesRepo.insertGrantsForRole(slug)
  if (grantErr) throw AppError.internal('Role created but failed to seed its permission grants', grantErr)

  return data
}

export async function renameRole(slug: string, label: string) {
  const { data: existing } = await adminRolesRepo.findRoleBySlug(slug)
  if (!existing) throw AppError.notFound('Role')

  const { data, error } = await adminRolesRepo.updateRoleLabel(slug, label)
  if (error || !data) throw AppError.internal('Failed to rename role', error)
  return data
}

export async function deleteRoleBySlug(slug: string) {
  const { data: existing } = await adminRolesRepo.findRoleBySlug(slug)
  if (!existing) throw AppError.notFound('Role')
  if (existing.is_system) throw AppError.badRequest(`"${existing.label}" is a system role and cannot be deleted`)

  const { count, error: countErr } = await adminRolesRepo.countProfilesWithRole(slug)
  if (countErr) throw AppError.internal('Failed to check role usage', countErr)
  if (count && count > 0) {
    throw AppError.badRequest(`Cannot delete "${existing.label}" — ${count} employee(s) are still assigned to it`)
  }

  const { error } = await adminRolesRepo.deleteRole(slug)
  if (error) throw AppError.internal('Failed to delete role', error)
}
