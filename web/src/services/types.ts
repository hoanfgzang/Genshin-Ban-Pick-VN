import type { Inventory } from '@/domain/inventory'

export interface User {
  id: string
  username: string
  email: string | null
  isGuest: boolean
  createdAt: string
}

export interface LoginInput {
  username: string
  password: string
  remember: boolean
}

export interface RegisterInput {
  username: string
  email: string
  password: string
}

/** Lỗi nghiệp vụ hiển thị được cho người dùng. */
export class ServiceError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ServiceError'
  }
}

/** Khớp 1-1 với /api/auth/* trong docs/BACKEND_PLAN.md */
export interface AuthService {
  login(input: LoginInput): Promise<User>
  register(input: RegisterInput): Promise<User>
  loginAsGuest(): Promise<User>
  logout(): Promise<void>
  getCurrentUser(): Promise<User | null>
}

/** Khớp với GET/PUT /api/me/inventory */
export interface InventoryService {
  get(userId: string): Promise<Inventory>
  save(userId: string, inventory: Inventory): Promise<void>
}
