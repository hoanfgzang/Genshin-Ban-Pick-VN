import { ServiceError, type AuthConfig, type AuthService, type User } from '../types'
import {
  apiRequest,
  clearAuthToken,
  getAuthToken,
  isGuestSession,
  setAuthToken,
  setGuestSession,
} from './apiClient'

const GUEST_USER: User = {
  id: 'guest',
  uid: '000000000',
  displayName: 'Khách',
  email: null,
  role: 'guest',
  isGuest: true,
  createdAt: new Date(0).toISOString(),
}

interface AuthResponse {
  user: User
  token: string
}

export const httpAuthService: AuthService = {
  async getConfig() {
    try {
      return await apiRequest<AuthConfig>('/api/auth/config')
    } catch {
      return { requireEmail: false }
    }
  },

  async login(input) {
    const res = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setGuestSession(false)
    setAuthToken(res.token, input.remember)
    return res.user
  },

  async register(input) {
    const res = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setGuestSession(false)
    setAuthToken(res.token, true)
    return res.user
  },

  async loginAsGuest() {
    clearAuthToken()
    setGuestSession(true)
    return GUEST_USER
  },

  async logout() {
    const wasGuest = isGuestSession()
    setGuestSession(false)
    clearAuthToken()
    if (!wasGuest) {
      try {
        await apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
      } catch {
        // ignore logout network errors
      }
    }
  },

  async getCurrentUser() {
    if (isGuestSession()) return GUEST_USER
    if (!getAuthToken()) return null
    try {
      return await apiRequest<User>('/api/auth/me')
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'UNAUTHORIZED') {
        clearAuthToken()
      }
      return null
    }
  },
}
