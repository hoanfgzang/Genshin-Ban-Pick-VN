import type { Inventory } from '@/domain/inventory'
import type { MatchSide, RuleSet, RuleSetConfig } from '@/domain/ruleset'

export type UserRole = 'player' | 'admin' | 'guest'
export type ManagedRole = 'player' | 'admin'

export interface User {
  id: string
  uid: string
  displayName: string
  email: string | null
  role: UserRole
  isSuperAdmin?: boolean
  isGuest: boolean
  createdAt: string
}

export interface AdminUserItem {
  id: string
  uid: string
  displayName: string
  email: string | null
  role: ManagedRole
  isSeedAdmin: boolean
  ownedCount: number
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

export type MatchFormat = 'bo1' | 'bo3'
export type MatchStatus =
  | 'lobby'
  | 'drafting'
  | 'weapon_phase'
  | 'scoring'
  | 'between_games'
  | 'finished'
export type WinnerSide = MatchSide | 'draw'
export type WinReason = 'score' | 'lower_cost' | 'fewer_4star' | 'forfeit_timeout' | 'draw'

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
  characterCustomCostId?: string | null
  characterCustomCostNote?: string | null
  weaponSlug: string | null
  refinement: number
  weaponCost: number
  weaponRefinementSeconds: number
  weaponCustomCostId?: string | null
  weaponCustomCostNote?: string | null
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
  reserveRemainingSeconds?: number
  overtimePenaltySeconds: number
  weaponsLocked: boolean
  chambers: ChamberTimeInput[] | null
  chamberDiffs: number[] | null
  chamberTotalSeconds: number | null
  finalScore: number | null
  scoreSubmitted: boolean
}

export interface CompletedGameSideSummary {
  side: MatchSide
  player: MatchPlayerInfo | null
  bans: (string | null)[]
  picks: MatchPickSlot[]
  totalCost: number
  costPenaltySeconds: number
  weaponRefinementSeconds: number
  reserveRemainingSeconds?: number
  overtimePenaltySeconds: number
  chamberTotalSeconds: number | null
  finalScore: number | null
  fourStarCount: number
}

export interface CompletedGameRecord {
  gameNumber: number
  blue: CompletedGameSideSummary
  red: CompletedGameSideSummary
  winnerSide: WinnerSide
  winnerUserId: string | null
  winReason: WinReason
  finishedAt: string
}

export interface NextGameSetup {
  gameNumber: number
  sidePickerUserId: string | null
  autoSwapped: boolean
  blueUserId: string | null
  redUserId: string | null
  readyUserIds: string[]
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
  hoverCharacterSlug?: string | null
  turnDeadlineAt: string | null
  undoRequest?: UndoRequest | null
  winnerSide: WinnerSide | null
  format?: MatchFormat
  maxGames?: number
  winsToWin?: number
  currentGame?: number
  seriesScores?: Record<string, number>
  gameHistory?: CompletedGameRecord[]
  nextGameSetup?: NextGameSetup | null
  winnerUserId?: string | null
  lastGameWinReason?: WinReason | null
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
  format?: MatchFormat
  currentGame?: number
  maxGames?: number
  blueSeriesWins?: number
  redSeriesWins?: number
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
  create(rulesetId: string, format?: MatchFormat): Promise<MatchState>
  get(code: string): Promise<MatchState>
  listMyMatches(): Promise<MatchSummary[]>
  getWebSocketUrl(code: string): string
}

export interface AdminUserService {
  list(
    params?: { q?: string; role?: ManagedRole | 'all' },
    adminSecret?: string,
  ): Promise<AdminUserItem[]>
  updateRole(userId: string, role: ManagedRole, adminSecret?: string): Promise<AdminUserItem>
  updateRoleByUid(uid: string, role: ManagedRole, adminSecret?: string): Promise<AdminUserItem>
}
