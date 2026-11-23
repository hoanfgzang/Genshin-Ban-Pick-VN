import { create } from 'zustand'
import { authService, ServiceError, type LoginInput, type RegisterInput, type User } from '@/services'

type Status = 'idle' | 'loading' | 'ready'

interface AuthState {
  user: User | null
  status: Status
  init: () => Promise<void>
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  loginAsGuest: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'idle',

  async init() {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    const user = await authService.getCurrentUser()
    set({ user, status: 'ready' })
  },

  async login(input) {
    const user = await authService.login(input)
    set({ user, status: 'ready' })
  },

  async register(input) {
    const user = await authService.register(input)
    set({ user, status: 'ready' })
  },

  async loginAsGuest() {
    const user = await authService.loginAsGuest()
    set({ user, status: 'ready' })
  },

  async logout() {
    await authService.logout()
    set({ user: null, status: 'ready' })
  },
}))

export function errorMessage(err: unknown): string {
  if (err instanceof ServiceError) return err.message
  return 'Đã có lỗi xảy ra, vui lòng thử lại.'
}
