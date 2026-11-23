/**
 * Điểm chuyển đổi duy nhất giữa mock (localStorage) và backend thật.
 * GĐ4: thêm services/http/* và chọn theo import.meta.env.VITE_API_MODE.
 */
import { mockAuthService } from './mock/authService'
import { mockInventoryService } from './mock/inventoryService'
import type { AuthService, InventoryService } from './types'

export const authService: AuthService = mockAuthService
export const inventoryService: InventoryService = mockInventoryService

export * from './types'
