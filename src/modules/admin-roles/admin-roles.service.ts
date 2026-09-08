import { AppError } from '../../lib/errors'
import * as adminRolesRepo from './admin-roles.repository'
import type { AdminRoleValue } from './admin-roles.schema'

// The CEO is the platform owner/founder — it always holds every permission and
// no one can edit its grants. Enforced here (writes) and in
// auth.service.resolveAdminPermissions (reads resolve to the full catalog).
const OWNER_ROLE = 'ceo'

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

  // Present the CEO column as full access regardless of what rows are stored,
  // so the UI reflects reality (and can lock the column) even if the seed
  // matrix ever drifts or a new permission hasn't been backfilled.
  const matrixWithoutOwner = matrix.filter((row) => row.admin_role !== OWNER_ROLE)
  const ownerRows = permissions.map((p) => ({
    admin_role:     OWNER_ROLE,
    permission_key: p.key as string,
    granted:        true,
    scope:          'all' as const,
  }))

  return { permissions, matrix: [...matrixWithoutOwner, ...ownerRows], roles }
}

// ── Toggle a single grant ─────────────────────────────────────────────────────
export async function updateRolePermission(role: AdminRoleValue, permissionKey: string, granted: boolean, scope?: 'all' | 'own') {
  if (role === OWNER_ROLE) {
    throw AppError.badRequest('The CEO is the platform owner and always has every permission — its access cannot be changed.')
  }

  const { data: existing, error: findErr } = await adminRolesRepo.findGrant(role, permissionKey)
  if (findErr || !existing) throw AppError.notFound('Permission')

  const { data, error } = await adminRolesRepo.upsertGrant(role, permissionKey, granted, scope)
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
