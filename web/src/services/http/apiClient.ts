import { readJSON, removeKey, writeJSON } from '@/lib/storage'
import { ServiceError } from '../types'

const TOKEN_KEY = 'auth_token'
const GUEST_KEY = 'guest_session'

export function getAuthToken(): string | null {
  return (
    readJSON<string | null>(TOKEN_KEY, null, 'session') ??
    readJSON<string | null>(TOKEN_KEY, null, 'local')
  )
}

export function setAuthToken(token: string, remember: boolean): void {
  removeKey(TOKEN_KEY, 'local')
  removeKey(TOKEN_KEY, 'session')
  writeJSON(TOKEN_KEY, token, remember ? 'local' : 'session')
}

export function clearAuthToken(): void {
  removeKey(TOKEN_KEY, 'local')
  removeKey(TOKEN_KEY, 'session')
}

export function isGuestSession(): boolean {
  return readJSON<boolean>(GUEST_KEY, false, 'local')
}

export function setGuestSession(active: boolean): void {
  if (active) {
    writeJSON(GUEST_KEY, true, 'local')
  } else {
    removeKey(GUEST_KEY, 'local')
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(path, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ServiceError(
      'NETWORK_ERROR',
      'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra server Python đã chạy chưa.',
    )
  }

  if (!res.ok) {
    let code = 'HTTP_ERROR'
    let message = `Lỗi máy chủ (${res.status}).`
    try {
      const body = (await res.json()) as {
        code?: string
        message?: string
        detail?: string | { code?: string; message?: string }
      }
      if (body.code) code = body.code
      if (body.message) message = body.message
      else if (typeof body.detail === 'string') message = body.detail
      else if (body.detail && typeof body.detail === 'object') {
        if (body.detail.code) code = body.detail.code
        if (body.detail.message) message = body.detail.message
      }
    } catch {
      // ignore non-json error response
    }
    throw new ServiceError(code, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
