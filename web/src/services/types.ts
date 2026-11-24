import type { Inventory } from '@/domain/inventory'
import type { MatchSide, RuleSet, RuleSetConfig } from '@/domain/ruleset'

export type UserRole = 'player' | 'admin' | 'guest'

export interface User {
  id: string
  uid: string
  displayName: string
  email: string | null
  role: UserRole
  isGuest: boolean
  createdAt: string
}

export interface AuthConfig {
  requireEmail: boolean
}

export interface LoginInput {
  uid: string
  password: string
  remember: boolean
}

export interface RegisterInput {
  uid: string
  displayName: string
  email?: string
  password: string
}

export interface RuleSetUpsertInput {
  name: string
  description: string
  isActive: boolean
  isDefault: boolean
  config: RuleSetConfig
}

export type MatchStatus = 'lobby' | 'drafting' | 'weapon_phase' | 'scoring' | 'finished'
export type WinnerSide = MatchSide | 'draw'

export interface ChamberTimeInput {
  minutes: number
  seconds: number
}

export interface MatchPlayerInfo {
  userId: string
  uid: string
  displayName: string
  ownedCount: number
}

export interface MatchPickSlot {
  slot: number
  characterSlug: string
  constellation: number
  level: number
  characterCost: number
  weaponSlug: string | null
  refinement: number
  weaponCost: number
  weaponRefinementSeconds: number
  totalSlotCost: number
}

export interface SideOwnedChar {
  slug: string
  constellation: number
  level: number
}

export interface UndoRequest {
  requesterSide: MatchSide
  targetStepIndex: number
  targetStepNumber: number
  targetAction: 'ban' | 'pick'
  targetCharacterSlug: string | null
  stepsToRevert: number
  createdAt: string
}

export interface SideState {
  player: MatchPlayerInfo | null
  ready: boolean
  ownedCharacters: Record<string, SideOwnedChar>
  bans: (string | null)[]
  picks: MatchPickSlot[]
  lineup?: number[]
  totalCost: number
  costPenaltySeconds: number
  weaponRefinementSeconds: number
  overtimePenaltySeconds: number
  weaponsLocked: boolean
  chambers: ChamberTimeInput[] | null
  chamberDiffs: number[] | null
  chamberTotalSeconds: number | null
  finalScore: number | null
  scoreSubmitted: boolean
}

export interface MatchState {
  code: string
  status: MatchStatus
  rulesetId: string
  rulesetName: string
  ruleset: RuleSetConfig
  hostUserId: string
  sides: Record<MatchSide, SideState>
  currentStepIndex: number
  turnDeadlineAt: string | null
  undoRequest?: UndoRequest | null
  winnerSide: WinnerSide | null
  createdAt: string
  finishedAt: string | null
}

export interface MatchSummary {
  id: string
  code: string
  rulesetName: string
  status: MatchStatus
  winnerSide: WinnerSide | null
  bluePlayer: MatchPlayerInfo | null
  redPlayer: MatchPlayerInfo | null
  blueFinalScore: number | null
  redFinalScore: number | null
  createdAt: string
  finishedAt: string | null
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

export interface AuthService {
  getConfig(): Promise<AuthConfig>
  login(input: LoginInput): Promise<User>
  register(input: RegisterInput): Promise<User>
  loginAsGuest(): Promise<User>
  logout(): Promise<void>
  getCurrentUser(): Promise<User | null>
}

export interface InventoryService {
  get(userId: string): Promise<Inventory>
  save(userId: string, inventory: Inventory): Promise<void>
}

export interface RuleSetService {
  list(activeOnly?: boolean): Promise<RuleSet[]>
  get(id: string): Promise<RuleSet>
  create(input: RuleSetUpsertInput): Promise<RuleSet>
  update(id: string, input: RuleSetUpsertInput): Promise<RuleSet>
  remove(id: string): Promise<void>
}

export interface MatchService {
  create(rulesetId: string): Promise<MatchState>
  get(code: string): Promise<MatchState>
  listMyMatches(): Promise<MatchSummary[]>
  getWebSocketUrl(code: string): string
}
