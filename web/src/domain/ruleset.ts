export type MatchSide = 'blue' | 'red'
export type DraftActionType = 'ban' | 'pick'
export type TieBreakRule = 'none' | 'lower_cost' | 'fewer_4star' | 'lower_cost_then_fewer_4star'

export const TIE_BREAK_OPTIONS: ReadonlyArray<{
  value: TieBreakRule
  label: string
  description: string
}> = [
  {
    value: 'none',
    label: 'Không xét phụ (Mặc định)',
    description: 'Nếu tổng điểm giây bằng nhau thì kết quả ván là Hòa.',
  },
  {
    value: 'lower_cost',
    label: 'Ưu tiên tổng Cost thấp hơn',
    description: 'Khi bằng tổng điểm giây, bên có tổng Cost (nhân vật + vũ khí) ít hơn sẽ thắng.',
  },
  {
    value: 'fewer_4star',
    label: 'Ưu tiên ít nhân vật 4★ hơn',
    description: 'Khi bằng tổng điểm giây, bên pick ít nhân vật 4★ hơn sẽ thắng.',
  },
  {
    value: 'lower_cost_then_fewer_4star',
    label: 'Cost thấp hơn → Ít nhân vật 4★ hơn',
    description: 'Xét tổng Cost thấp hơn trước; nếu Cost vẫn bằng nhau thì xét bên ít nhân vật 4★ hơn.',
  },
]

export interface DraftStep {
  step: number
  side: MatchSide
  action: DraftActionType
  seconds?: number | null
}

export interface CostMilestone {
  minCost: number
  maxCost: number | null
  secondsPerCost: number
  bonusSeconds: number
}

export interface CharacterCustomCost {
  id: string
  costs: number[]
  note: string
}

export interface WeaponCustomCost {
  id: string
  cost: number
  refinementSeconds: number[]
  note: string
}

export interface CostRules {
  defaultChar5Costs: number[]
  defaultChar4Costs: number[]
  defaultWeapon5Cost: number
  defaultWeapon4Cost: number
  defaultWeapon5RefinementSeconds: number[]
  defaultWeapon4RefinementSeconds: number[]
  characterOverrides: Record<string, number[]>
  characterCustomCosts?: Record<string, CharacterCustomCost[]>
  weaponCostOverrides: Record<string, number>
  weaponRefinementOverrides: Record<string, number[]>
  weaponCustomCosts?: Record<string, WeaponCustomCost[]>
  baseSecondsPerCost: number
  milestones: CostMilestone[]
  draftBonusSecondsPerCost: number
}

export interface RuleSetConfig {
  draftSteps: DraftStep[]
  allowDuplicatePick: boolean
  tieBreakRule?: TieBreakRule
  perTurnSeconds: number
  banSeconds?: number
  pickSeconds?: number
  useReserveTime?: boolean
  reserveTimeSeconds?: number
  maxOvertimeSeconds?: number
  weaponPhaseSeconds: number
  chamberBaseSeconds: 540
  costRules: CostRules
}

export function getStepBaseSeconds(config: RuleSetConfig, step: DraftStep): number {
  if (typeof step.seconds === 'number' && Number.isFinite(step.seconds)) {
    return Math.max(0, Math.trunc(step.seconds))
  }
  if (step.action === 'ban') {
    return config.banSeconds ?? config.perTurnSeconds
  }
  return config.pickSeconds ?? config.perTurnSeconds
}

export interface RuleSet {
  id: string
  name: string
  description: string
  isActive: boolean
  isDefault: boolean
  config: RuleSetConfig
  updatedBy: string | null
  updatedAt: string
}

const DEFAULT_PATTERN: ReadonlyArray<readonly [MatchSide, DraftActionType]> = [
  ['blue', 'ban'],
  ['red', 'ban'],
  ['blue', 'ban'],
  ['red', 'ban'],
  ['blue', 'pick'],
  ['red', 'pick'],
  ['red', 'pick'],
  ['blue', 'pick'],
  ['blue', 'pick'],
  ['red', 'pick'],
  ['red', 'pick'],
  ['blue', 'pick'],
  ['blue', 'ban'],
  ['red', 'ban'],
  ['blue', 'pick'],
  ['red', 'pick'],
  ['red', 'pick'],
  ['blue', 'pick'],
  ['blue', 'pick'],
  ['red', 'pick'],
  ['red', 'pick'],
  ['blue', 'pick'],
]

export function createDefaultDraftSteps(): DraftStep[] {
  return DEFAULT_PATTERN.map(([side, action], idx) => ({
    step: idx + 1,
    side,
    action,
  }))
}

export function createDefaultRuleSetConfig(): RuleSetConfig {
  return {
    draftSteps: createDefaultDraftSteps(),
    allowDuplicatePick: false,
    tieBreakRule: 'none',
    perTurnSeconds: 45,
    banSeconds: 30,
    pickSeconds: 45,
    useReserveTime: true,
    reserveTimeSeconds: 120,
    maxOvertimeSeconds: 600,
    weaponPhaseSeconds: 90,
    chamberBaseSeconds: 540,
    costRules: {
      defaultChar5Costs: [1, 2, 3, 4, 5, 6, 7],
      defaultChar4Costs: [0, 0, 0, 0, 0, 0, 0],
      defaultWeapon5Cost: 1,
      defaultWeapon4Cost: 0,
      defaultWeapon5RefinementSeconds: [0, 5, 10, 15, 20],
      defaultWeapon4RefinementSeconds: [0, 0, 0, 0, 0],
      characterOverrides: {},
      characterCustomCosts: {},
      weaponCostOverrides: {},
      weaponRefinementOverrides: {},
      weaponCustomCosts: {},
      baseSecondsPerCost: 5,
      milestones: [
        { minCost: 0, maxCost: 6, secondsPerCost: 5, bonusSeconds: 0 },
        { minCost: 6, maxCost: 12, secondsPerCost: 8, bonusSeconds: 0 },
        { minCost: 12, maxCost: null, secondsPerCost: 12, bonusSeconds: 0 },
      ],
      draftBonusSecondsPerCost: 0,
    },
  }
}
