import { fakeLatency, readJSON, removeKey, writeJSON } from '@/lib/storage'
import { ServiceError, type AuthService, type User } from '../types'

/**
 * ⚠️ CHỈ ĐỂ DEMO/TEST CỤC BỘ. Backend thật nằm ở `services/http`.
 */
interface StoredUser extends User {
  passwordHash: string
}

const USERS_KEY = 'users'
const SESSION_KEY = 'session'
const GUEST_ID = 'guest'

const GUEST_USER: User = {
  id: GUEST_ID,
  uid: '000000000',
  displayName: 'Khách',
  email: null,
  role: 'guest',
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
  async getConfig() {
    return { requireEmail: false }
  },

  async login({ uid, password, remember }) {
    await fakeLatency()
    const user = loadUsers()[uid.trim()]
    if (!user || user.passwordHash !== (await hash(password))) {
      throw new ServiceError('INVALID_CREDENTIALS', 'Sai UID hoặc mật khẩu.')
    }
    setSession(user.id, remember)
    return toPublic(user)
  },

  async register({ uid, displayName, email, password }) {
    await fakeLatency()
    const users = loadUsers()
    const key = uid.trim()
    if (users[key]) {
      throw new ServiceError('UID_TAKEN', 'UID này đã được đăng ký.')
    }
    const normalizedEmail = email?.trim() ? email.trim().toLowerCase() : null
    if (normalizedEmail && Object.values(users).some((u) => u.email === normalizedEmail)) {
      throw new ServiceError('EMAIL_TAKEN', 'Email đã được sử dụng.')
    }
    const user: StoredUser = {
      id: crypto.randomUUID(),
      uid: key,
      displayName: displayName.trim(),
      email: normalizedEmail,
      role: 'player',
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
