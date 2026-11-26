import { getCharacter } from './characters'
import type { CharacterCustomCost, CostMilestone, CostRules, WeaponCustomCost } from './ruleset'
import { getWeapon } from './weapons'

export const CHAMBER_BASE_SECONDS = 540

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function getCharacterCustomCosts(slug: string, costRules: CostRules): CharacterCustomCost[] {
  return costRules.characterCustomCosts?.[slug] ?? []
}

export function getWeaponCustomCosts(
  slug: string | null | undefined,
  costRules: CostRules,
): WeaponCustomCost[] {
  if (!slug) return []
  return costRules.weaponCustomCosts?.[slug] ?? []
}

export function calcCharacterCost(
  slug: string,
  constellation: number,
  costRules: CostRules,
  customCostId?: string | null,
): number {
  const c = Math.max(0, Math.min(6, Math.trunc(constellation)))
  if (customCostId) {
    const custom = getCharacterCustomCosts(slug, costRules).find((item) => item.id === customCostId)
    if (custom && custom.costs.length === 7) {
      return round2(custom.costs[c] ?? 0)
    }
  }
  const override = costRules.characterOverrides[slug]
  if (override && override.length === 7) {
    return round2(override[c] ?? 0)
  }
  const char = getCharacter(slug)
  const rarity = char?.rarity ?? 5
  const table = rarity >= 5 ? costRules.defaultChar5Costs : costRules.defaultChar4Costs
  return round2(table[c] ?? 0)
}

export function calcWeaponCost(
  slug: string | null | undefined,
  costRules: CostRules,
  customCostId?: string | null,
): number {
  if (!slug) return 0
  if (customCostId) {
    const custom = getWeaponCustomCosts(slug, costRules).find((item) => item.id === customCostId)
    if (custom) {
      return round2(custom.cost ?? 0)
    }
  }
  if (slug in costRules.weaponCostOverrides) {
    return round2(costRules.weaponCostOverrides[slug] ?? 0)
  }
  const weapon = getWeapon(slug)
  const rarity = weapon?.rarity ?? 4
  return round2(rarity >= 5 ? costRules.defaultWeapon5Cost : costRules.defaultWeapon4Cost)
}

export function calcWeaponRefinementSeconds(
  slug: string | null | undefined,
  refinement: number,
  costRules: CostRules,
  customCostId?: string | null,
): number {
  if (!slug) return 0
  const idx = Math.max(0, Math.min(4, Math.trunc(refinement) - 1))
  if (customCostId) {
    const custom = getWeaponCustomCosts(slug, costRules).find((item) => item.id === customCostId)
    if (custom && custom.refinementSeconds.length === 5) {
      return round2(custom.refinementSeconds[idx] ?? 0)
    }
  }
  const override = costRules.weaponRefinementOverrides[slug]
  if (override && override.length === 5) {
    return round2(override[idx] ?? 0)
  }
  const weapon = getWeapon(slug)
  const rarity = weapon?.rarity ?? 4
  const table =
    rarity >= 5
      ? costRules.defaultWeapon5RefinementSeconds
      : costRules.defaultWeapon4RefinementSeconds
  return round2(table[idx] ?? 0)
}

export function findActiveCostMilestone(
  totalCost: number,
  costRules: CostRules,
): CostMilestone | null {
  const cost = Math.max(0, totalCost)
  if (!costRules.milestones.length) {
    return null
  }

  const milestones = [...costRules.milestones].sort((a, b) => a.minCost - b.minCost)
  let active: CostMilestone | null = null

  for (const m of milestones) {
    const upper = m.maxCost ?? Number.POSITIVE_INFINITY
    if (m.minCost <= cost && cost < upper) {
      active = m
    }
  }

  if (!active) {
    for (const m of milestones) {
      if (m.maxCost !== null && cost === m.maxCost) {
        active = m
      }
    }
  }

  return active
}

export function calcCostPenaltySeconds(totalCost: number, costRules: CostRules): number {
  const cost = Math.max(0, totalCost)
  if (cost <= 0) return 0

  const active = findActiveCostMilestone(cost, costRules)
  if (!active) {
    return round2(cost * costRules.baseSecondsPerCost)
  }

  return round2(cost * active.secondsPerCost + active.bonusSeconds)
}

export function formatCostMilestoneSummary(
  totalCost: number,
  costRules: CostRules,
): { rangeLabel: string; rateLabel: string } {
  const cost = Math.max(0, totalCost)
  const active = findActiveCostMilestone(cost, costRules)

  if (cost <= 0 && (!active || active.bonusSeconds <= 0)) {
    return { rangeLabel: '0 cost', rateLabel: 'Chưa phát sinh phạt' }
  }

  if (active) {
    const maxLabel = active.maxCost === null ? '∞' : formatCost(active.maxCost)
    return {
      rangeLabel: `${formatCost(active.minCost)} → ${maxLabel}`,
      rateLabel: `${formatSeconds(active.secondsPerCost)}/cost${
        active.bonusSeconds > 0 ? ` + ${formatSeconds(active.bonusSeconds)}` : ''
      }`,
    }
  }

  return {
    rangeLabel: 'Hệ số cơ bản',
    rateLabel: `${formatSeconds(costRules.baseSecondsPerCost)}/cost`,
  }
}

export function calcChamberDiff(minutes: number, seconds: number): number | null {
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
  if (minutes < 0 || minutes > 9 || seconds < 0 || seconds > 59) return null
  const entered = Math.trunc(minutes) * 60 + Math.trunc(seconds)
  if (entered > CHAMBER_BASE_SECONDS) return null
  return CHAMBER_BASE_SECONDS - entered
}

export function formatCost(cost: number): string {
  const r = round2(cost)
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, '')
}

export function formatSeconds(sec: number): string {
  const r = round2(sec)
  return Number.isInteger(r) ? `${r}s` : `${r.toFixed(1)}s`
}
