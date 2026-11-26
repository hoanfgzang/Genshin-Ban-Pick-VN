import { round2 } from '@/domain/cost'
import {
  splitDraftIntoPhases,
  type DraftActionType,
  type DraftStep,
  type MatchSide,
} from '@/domain/ruleset'
import type { MatchPickSlot, MatchStatus, SideState } from '@/services'

export const TEAM_SIZE = 4

export function normalizeLineup(picksCount: number, lineup?: readonly number[]): number[] {
  const fallback = Array.from({ length: picksCount }, (_, i) => i)
  if (!lineup || lineup.length !== picksCount) return fallback
  const seen = new Set<number>()
  for (const idx of lineup) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= picksCount || seen.has(idx)) {
      return fallback
    }
    seen.add(idx)
  }
  return [...lineup]
}

export function swapLineupPositions(
  order: readonly number[],
  indexA: number,
  indexB: number,
): number[] {
  const next = [...order]
  if (
    indexA === indexB ||
    indexA < 0 ||
    indexB < 0 ||
    indexA >= next.length ||
    indexB >= next.length
  ) {
    return next
  }
  const tmp = next[indexA]
  next[indexA] = next[indexB]
  next[indexB] = tmp
  return next
}

export function swapTeams(
  order: readonly number[],
  teamA = 0,
  teamB = 1,
  teamSize = TEAM_SIZE,
): number[] {
  const next = [...order]
  const startA = teamA * teamSize
  const startB = teamB * teamSize
  if (
    teamA === teamB ||
    teamSize <= 0 ||
    startA < 0 ||
    startB < 0 ||
    startA >= next.length ||
    startB >= next.length
  ) {
    return next
  }
  const lenA = Math.min(teamSize, next.length - startA)
  const lenB = Math.min(teamSize, next.length - startB)
  const count = Math.min(lenA, lenB)
  for (let k = 0; k < count; k++) {
    const tmp = next[startA + k]
    next[startA + k] = next[startB + k]
    next[startB + k] = tmp
  }
  return next
}

export function splitIntoTeams(order: readonly number[], teamSize = TEAM_SIZE): number[][] {
  if (order.length === 0 || teamSize <= 0) return []
  const teams: number[][] = []
  for (let i = 0; i < order.length; i += teamSize) {
    teams.push(order.slice(i, i + teamSize))
  }
  return teams
}

export function computeCostBreakdown(picks: readonly MatchPickSlot[]): {
  characterCost: number
  weaponCost: number
  weaponRefinementSeconds: number
} {
  let characterCost = 0
  let weaponCost = 0
  let weaponRefinementSeconds = 0
  for (const p of picks) {
    characterCost += p.characterCost
    weaponCost += p.weaponCost
    weaponRefinementSeconds += p.weaponRefinementSeconds ?? 0
  }
  return {
    characterCost: round2(characterCost),
    weaponCost: round2(weaponCost),
    weaponRefinementSeconds: round2(weaponRefinementSeconds),
  }
}

export interface DraftBoardCell {
  step: number
  side: MatchSide
  action: DraftActionType
  status: 'done' | 'active' | 'upcoming'
  characterSlug: string | null
  constellation: number | null
  pickSlot: MatchPickSlot | null
}

export interface DraftBoardSideLayout {
  pickRows: DraftBoardCell[][]
  banRows: DraftBoardCell[][]
}

export interface DraftHighlightSets {
  activeStep: number | null
  activeGroupSteps: Set<number>
  nextGroupSteps: Set<number>
}

export function getDraftHighlightSets(
  steps: readonly DraftStep[],
  currentStepIndex: number,
  matchStatus: MatchStatus,
): DraftHighlightSets {
  const empty: DraftHighlightSets = {
    activeStep: null,
    activeGroupSteps: new Set(),
    nextGroupSteps: new Set(),
  }
  if (matchStatus !== 'drafting' || currentStepIndex < 0 || currentStepIndex >= steps.length) {
    return empty
  }

  const curr = steps[currentStepIndex]
  let start = currentStepIndex
  while (
    start > 0 &&
    steps[start - 1].side === curr.side &&
    steps[start - 1].action === curr.action
  ) {
    start -= 1
  }
  let end = currentStepIndex
  while (
    end + 1 < steps.length &&
    steps[end + 1].side === curr.side &&
    steps[end + 1].action === curr.action
  ) {
    end += 1
  }

  const activeGroupSteps = new Set<number>()
  for (let i = start; i <= end; i += 1) {
    activeGroupSteps.add(steps[i].step)
  }

  const nextGroupSteps = new Set<number>()
  const nextStart = end + 1
  if (nextStart < steps.length) {
    const nxt = steps[nextStart]
    let nextEnd = nextStart
    while (
      nextEnd + 1 < steps.length &&
      steps[nextEnd + 1].side === nxt.side &&
      steps[nextEnd + 1].action === nxt.action
    ) {
      nextEnd += 1
    }
    for (let i = nextStart; i <= nextEnd; i += 1) {
      nextGroupSteps.add(steps[i].step)
    }
  }

  return {
    activeStep: curr.step,
    activeGroupSteps,
    nextGroupSteps,
  }
}

export function getMaxConsecutivePicks(steps: readonly DraftStep[]): number {
  let maxStreak = 0
  let currentStreak = 0
  let currentSide: MatchSide | null = null
  for (const s of steps) {
    if (s.action === 'pick') {
      if (s.side === currentSide) {
        currentStreak += 1
      } else {
        currentSide = s.side
        currentStreak = 1
      }
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak
      }
    } else {
      currentSide = null
      currentStreak = 0
    }
  }
  return maxStreak
}

export function areCellsConsecutive(a: DraftBoardCell, b: DraftBoardCell): boolean {
  return a.side === b.side && a.action === b.action && Math.abs(a.step - b.step) === 1
}

export function groupConsecutiveCells(row: readonly DraftBoardCell[]): DraftBoardCell[][] {
  if (row.length === 0) return []
  const groups: DraftBoardCell[][] = [[row[0]]]
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1]
    const curr = row[i]
    if (areCellsConsecutive(prev, curr)) {
      groups[groups.length - 1].push(curr)
    } else {
      groups.push([curr])
    }
  }
  return groups
}

function packRunsIntoRows(
  cells: readonly DraftBoardCell[],
  targetRowSize: number,
): DraftBoardCell[][] {
  if (cells.length === 0) return []
  const cap = Math.max(1, targetRowSize)
  const runs = groupConsecutiveCells(cells)
  const rows: DraftBoardCell[][] = []
  let current: DraftBoardCell[] = []

  for (const run of runs) {
    if (run.length > cap) {
      if (current.length > 0) {
        rows.push(current)
        current = []
      }
      for (let i = 0; i < run.length; i += cap) {
        rows.push(run.slice(i, i + cap))
      }
      continue
    }
    if (current.length > 0 && current.length + run.length > cap) {
      rows.push(current)
      current = [...run]
    } else {
      current.push(...run)
    }
  }
  if (current.length > 0) {
    rows.push(current)
  }
  return rows
}

function chunkCellsIntoRows(
  cells: readonly DraftBoardCell[],
  rowSize: number,
): DraftBoardCell[][] {
  if (cells.length === 0) return []
  const cap = Math.max(1, rowSize)
  const rows: DraftBoardCell[][] = []
  for (let i = 0; i < cells.length; i += cap) {
    rows.push(cells.slice(i, i + cap))
  }
  return rows
}

export function splitPickCellsIntoRows(
  picks: readonly DraftBoardCell[],
  maxConsecutivePicks: number,
): DraftBoardCell[][] {
  if (picks.length === 0) return []
  if (maxConsecutivePicks >= 3) {
    return packRunsIntoRows(picks, maxConsecutivePicks)
  }
  return chunkCellsIntoRows(picks, Math.ceil(picks.length / 2))
}

export function splitBanCellsIntoRows(bans: readonly DraftBoardCell[]): DraftBoardCell[][] {
  if (bans.length === 0) return []
  return chunkCellsIntoRows(bans, Math.ceil(bans.length / 2))
}

/**
 * Chia danh sách bước Ban/Pick cho bên Trái (Blue) và Phải (Red) theo từng Phase Ban/Pick:
 * - 1 Phase gồm chuỗi lượt Ban liên tiếp ở đầu phase nối tiếp bởi chuỗi lượt Pick cho đến lượt Ban tiếp theo.
 * - Pick tách thành khối riêng nằm xa Ban ở phía ngoài; Ban nằm phía gần tâm.
 * - Mỗi dòng Pick (và mỗi dòng Ban) tương ứng với 1 Phase Ban/Pick.
 */
export function buildDraftBoardRows(
  steps: readonly DraftStep[],
  sides: Record<MatchSide, SideState>,
  currentStepIndex: number,
  matchStatus: MatchStatus,
): Record<MatchSide, DraftBoardSideLayout> {
  const phases = splitDraftIntoPhases(steps)
  const banIdx: Record<MatchSide, number> = { blue: 0, red: 0 }
  const pickIdx: Record<MatchSide, number> = { blue: 0, red: 0 }
  const bluePickRows: DraftBoardCell[][] = []
  const blueBanRows: DraftBoardCell[][] = []
  const redPickRows: DraftBoardCell[][] = []
  const redBanRows: DraftBoardCell[][] = []

  let flatIdx = 0
  for (const phase of phases) {
    const phaseBans: Record<MatchSide, DraftBoardCell[]> = { blue: [], red: [] }
    const phasePicks: Record<MatchSide, DraftBoardCell[]> = { blue: [], red: [] }

    for (const s of phase.steps) {
      const idx = flatIdx++
      const side = s.side
      const sideState = sides[side]
      const isDone = matchStatus !== 'drafting' || idx < currentStepIndex
      const isActive = matchStatus === 'drafting' && idx === currentStepIndex
      const status: DraftBoardCell['status'] = isDone ? 'done' : isActive ? 'active' : 'upcoming'

      if (s.action === 'ban') {
        const bIdx = banIdx[side]++
        const slug = bIdx < sideState.bans.length ? sideState.bans[bIdx] : null
        const owned = slug ? sideState.ownedCharacters[slug] : undefined
        phaseBans[side].push({
          step: s.step,
          side,
          action: 'ban',
          status,
          characterSlug: slug,
          constellation: owned?.constellation ?? null,
          pickSlot: null,
        })
      } else {
        const pIdx = pickIdx[side]++
        const pick = pIdx < sideState.picks.length ? sideState.picks[pIdx] : null
        phasePicks[side].push({
          step: s.step,
          side,
          action: 'pick',
          status,
          characterSlug: pick?.characterSlug ?? null,
          constellation: pick?.constellation ?? null,
          pickSlot: pick,
        })
      }
    }

    if (phaseBans.blue.length > 0) blueBanRows.push(phaseBans.blue)
    if (phasePicks.blue.length > 0) bluePickRows.push([...phasePicks.blue].reverse())
    if (phaseBans.red.length > 0) redBanRows.push(phaseBans.red)
    if (phasePicks.red.length > 0) redPickRows.push(phasePicks.red)
  }

  return {
    blue: {
      pickRows: bluePickRows,
      banRows: blueBanRows,
    },
    red: {
      pickRows: redPickRows,
      banRows: redBanRows,
    },
  }
}
