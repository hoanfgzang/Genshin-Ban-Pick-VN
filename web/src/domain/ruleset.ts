export type MatchSide = 'blue' | 'red'
export type DraftActionType = 'ban' | 'pick'

export interface DraftStep {
  step: number
  side: MatchSide
  action: DraftActionType
}

export interface CostMilestone {
  minCost: number
  maxCost: number | null
  secondsPerCost: number
  bonusSeconds: number
}

export interface CostRules {
  defaultChar5Costs: number[]
  defaultChar4Costs: number[]
  defaultWeapon5Cost: number
  defaultWeapon4Cost: number
  defaultWeapon5RefinementSeconds: number[]
  defaultWeapon4RefinementSeconds: number[]
  characterOverrides: Record<string, number[]>
  weaponCostOverrides: Record<string, number>
  weaponRefinementOverrides: Record<string, number[]>
  baseSecondsPerCost: number
  milestones: CostMilestone[]
  draftBonusSecondsPerCost: number
}

export interface RuleSetConfig {
  draftSteps: DraftStep[]
  allowDuplicatePick: boolean
  perTurnSeconds: number
  weaponPhaseSeconds: number
  chamberBaseSeconds: 540
  costRules: CostRules
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
    perTurnSeconds: 45,
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
      weaponCostOverrides: {},
      weaponRefinementOverrides: {},
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
