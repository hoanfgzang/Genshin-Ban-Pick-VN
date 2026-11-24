import { httpAdminUserService } from './http/adminUserService'
import { httpAuthService } from './http/authService'
import { httpInventoryService } from './http/inventoryService'
import { httpMatchService } from './http/matchService'
import { httpRuleSetService } from './http/rulesetService'
import { mockAuthService } from './mock/authService'
import { mockInventoryService } from './mock/inventoryService'
import type {
  AdminUserService,
  AuthService,
  InventoryService,
  MatchService,
  RuleSetService,
} from './types'

const useMock = import.meta.env.VITE_API_MODE === 'mock'

export const authService: AuthService = useMock ? mockAuthService : httpAuthService
export const inventoryService: InventoryService = useMock ? mockInventoryService : httpInventoryService
export const rulesetService: RuleSetService = httpRuleSetService
export const matchService: MatchService = httpMatchService
export const adminUserService: AdminUserService = httpAdminUserService

export * from './types'
