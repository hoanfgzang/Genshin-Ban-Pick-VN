import type { AdminUserItem, AdminUserService, ManagedRole } from '../types'
import { apiRequest } from './apiClient'

function secretHeaders(adminSecret?: string): HeadersInit | undefined {
  const clean = adminSecret?.trim()
  return clean ? { 'X-Admin-Secret': clean } : undefined
}

export const httpAdminUserService: AdminUserService = {
  async list(params = {}, adminSecret) {
    const qs = new URLSearchParams()
    if (params.q?.trim()) qs.set('q', params.q.trim())
    if (params.role && params.role !== 'all') qs.set('role', params.role)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiRequest<AdminUserItem[]>(`/api/admin/users${suffix}`, {
      headers: secretHeaders(adminSecret),
    })
  },

  async updateRole(userId, role: ManagedRole, adminSecret) {
    return apiRequest<AdminUserItem>(
      `/api/admin/users/${encodeURIComponent(userId)}/role`,
      {
        method: 'PATCH',
        headers: secretHeaders(adminSecret),
        body: JSON.stringify({ role }),
      },
    )
  },

  async updateRoleByUid(uid, role: ManagedRole, adminSecret) {
    return apiRequest<AdminUserItem>('/api/admin/users/by-uid', {
      method: 'POST',
      headers: secretHeaders(adminSecret),
      body: JSON.stringify({ uid: uid.trim(), role }),
    })
  },
}
