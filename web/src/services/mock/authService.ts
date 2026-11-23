import { fakeLatency, readJSON, removeKey, writeJSON } from '@/lib/storage'
import { ServiceError, type AuthService, type User } from '../types'

/**
 * ⚠️ CHỈ ĐỂ DEMO UI. Tài khoản lưu trong localStorage, không an toàn.
 * Sẽ được thay bằng services/http khi có backend.
 */

interface StoredUser extends User {
  passwordHash: string
}

const USERS_KEY = 'users'
const SESSION_KEY = 'session'
const GUEST_ID = 'guest'

const GUEST_USER: User = {
  id: GUEST_ID,
  username: 'Khách',
  email: null,
  isGuest: true,
  createdAt: new Date(0).toISOString(),
}

async function hash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

const loadUsers = () => readJSON<Record<string, StoredUser>>(USERS_KEY, {})
const saveUsers = (users: Record<string, StoredUser>) => writeJSON(USERS_KEY, users)

function toPublic({ passwordHash: _ignored, ...user }: StoredUser): User {
  void _ignored
  return user
}

function setSession(userId: string, remember: boolean) {
  removeKey(SESSION_KEY, 'local')
  removeKey(SESSION_KEY, 'session')
  writeJSON(SESSION_KEY, userId, remember ? 'local' : 'session')
}

export const mockAuthService: AuthService = {
  async login({ username, password, remember }) {
    await fakeLatency()
    const user = loadUsers()[username.trim().toLowerCase()]
    if (!user || user.passwordHash !== (await hash(password))) {
      throw new ServiceError('INVALID_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.')
    }
    setSession(user.id, remember)
    return toPublic(user)
  },

  async register({ username, email, password }) {
    await fakeLatency()
    const users = loadUsers()
    const key = username.trim().toLowerCase()
    if (users[key]) {
      throw new ServiceError('USERNAME_TAKEN', 'Tên đăng nhập đã tồn tại.')
    }
    const normalizedEmail = email.trim().toLowerCase()
    if (Object.values(users).some((u) => u.email === normalizedEmail)) {
      throw new ServiceError('EMAIL_TAKEN', 'Email đã được sử dụng.')
    }
    const user: StoredUser = {
      id: crypto.randomUUID(),
      username: username.trim(),
      email: normalizedEmail,
      isGuest: false,
      createdAt: new Date().toISOString(),
      passwordHash: await hash(password),
    }
    saveUsers({ ...users, [key]: user })
    setSession(user.id, true)
    return toPublic(user)
  },

  async loginAsGuest() {
    await fakeLatency(150)
    setSession(GUEST_ID, true)
    return GUEST_USER
  },

  async logout() {
    removeKey(SESSION_KEY, 'local')
    removeKey(SESSION_KEY, 'session')
  },

  async getCurrentUser() {
    const id =
      readJSON<string | null>(SESSION_KEY, null, 'session') ??
      readJSON<string | null>(SESSION_KEY, null, 'local')
    if (!id) return null
    if (id === GUEST_ID) return GUEST_USER
    const user = Object.values(loadUsers()).find((u) => u.id === id)
    return user ? toPublic(user) : null
  },
}
