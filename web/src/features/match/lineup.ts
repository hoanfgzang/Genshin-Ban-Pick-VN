import { round2 } from '@/domain/cost'
import type { DraftActionType, DraftStep, MatchSide } from '@/domain/ruleset'
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

export function splitPickCellsIntoRows(
  picks: readonly DraftBoardCell[],
  maxConsecutivePicks: number,
): DraftBoardCell[][] {
  if (picks.length === 0) return []
  if (maxConsecutivePicks >= 3) {
    return packRunsIntoRows(picks, maxConsecutivePicks)
  }
  const half = Math.ceil(picks.length / 2)
  return packRunsIntoRows(picks, half)
}

export function splitBanCellsIntoRows(bans: readonly DraftBoardCell[]): DraftBoardCell[][] {
  if (bans.length === 0) return []
  const half = Math.ceil(bans.length / 2)
  return packRunsIntoRows(bans, half)
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

/**
 * Chia danh sách bước Ban/Pick cho bên Trái (Blue) và Phải (Red):
 * - Pick tách thành khối riêng nằm xa Ban ở phía ngoài; Ban nằm phía gần tâm.
 * - Khi bộ luật có từ 3 lượt Pick liên tục trở lên, chia hàng Pick theo số lượt liên tục đó (vd 3-3-2 cho 8 Pick).
 * - Khi lượt Pick liên tục < 3, giữ 2 hàng (4-4 cho 8 Pick) như mặc định.
 */
export function buildDraftBoardRows(
  steps: readonly DraftStep[],
  sides: Record<MatchSide, SideState>,
  currentStepIndex: number,
  matchStatus: MatchStatus,
): Record<MatchSide, DraftBoardSideLayout> {
  const maxConsecutivePicks = getMaxConsecutivePicks(steps)

  const buildSide = (side: MatchSide): DraftBoardSideLayout => {
    const sideState = sides[side]
    const bans: DraftBoardCell[] = []
    const picks: DraftBoardCell[] = []
    let banIdx = 0
    let pickIdx = 0

    steps.forEach((s, idx) => {
      if (s.side !== side) return
      const isDone = matchStatus !== 'drafting' || idx < currentStepIndex
      const isActive = matchStatus === 'drafting' && idx === currentStepIndex
      const status: DraftBoardCell['status'] = isDone ? 'done' : isActive ? 'active' : 'upcoming'

      if (s.action === 'ban') {
        const slug = banIdx < sideState.bans.length ? sideState.bans[banIdx] : null
        const owned = slug ? sideState.ownedCharacters[slug] : undefined
        bans.push({
          step: s.step,
          side,
          action: 'ban',
          status,
          characterSlug: slug,
          constellation: owned?.constellation ?? null,
          pickSlot: null,
        })
        banIdx++
      } else {
        const pick = pickIdx < sideState.picks.length ? sideState.picks[pickIdx] : null
        picks.push({
          step: s.step,
          side,
          action: 'pick',
          status,
          characterSlug: pick?.characterSlug ?? null,
          constellation: pick?.constellation ?? null,
          pickSlot: pick,
        })
        pickIdx++
      }
    })

    const isPostDraft = matchStatus !== 'drafting'
    const pickRows = isPostDraft
      ? chunkCellsIntoRows(picks, Math.ceil(picks.length / 2))
      : splitPickCellsIntoRows(picks, maxConsecutivePicks)
    const banRows = isPostDraft
      ? chunkCellsIntoRows(bans, Math.ceil(bans.length / 2))
      : splitBanCellsIntoRows(bans)

    if (side === 'blue') {
      return {
        pickRows: pickRows.map((row) => [...row].reverse()),
        banRows,
      }
    }
    return {
      pickRows,
      banRows,
    }
  }

  return {
    blue: buildSide('blue'),
    red: buildSide('red'),
  }
}
