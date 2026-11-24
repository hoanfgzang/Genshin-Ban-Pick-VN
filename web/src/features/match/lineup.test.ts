import { describe, expect, it } from 'vitest'
import { createDefaultDraftSteps, type DraftStep } from '@/domain/ruleset'
import type { MatchPickSlot, SideState } from '@/services'
import {
  buildDraftBoardRows,
  computeCostBreakdown,
  getMaxConsecutivePicks,
  normalizeLineup,
  splitIntoTeams,
  swapLineupPositions,
  swapTeams,
} from './lineup'

function makePick(
  slot: number,
  characterCost: number,
  weaponCost: number,
  weaponRefinementSeconds = 0,
): MatchPickSlot {
  return {
    slot,
    characterSlug: `char-${slot}`,
    constellation: 0,
    level: 90,
    characterCost,
    weaponSlug: weaponCost > 0 || weaponRefinementSeconds > 0 ? `wep-${slot}` : null,
    refinement: 1,
    weaponCost,
    weaponRefinementSeconds,
    totalSlotCost: characterCost + weaponCost,
  }
}

function emptySide(picks: MatchPickSlot[] = [], bans: (string | null)[] = []): SideState {
  return {
    player: null,
    ready: true,
    ownedCharacters: {},
    bans,
    picks,
    totalCost: 0,
    costPenaltySeconds: 0,
    weaponRefinementSeconds: 0,
    overtimePenaltySeconds: 0,
    weaponsLocked: false,
    chambers: null,
    chamberDiffs: null,
    chamberTotalSeconds: null,
    finalScore: null,
    scoreSubmitted: false,
  }
}

describe('features/match/lineup', () => {
  it('normalizeLineup giữ hoán vị hợp lệ và fallback khi thiếu/trùng', () => {
    expect(normalizeLineup(4)).toEqual([0, 1, 2, 3])
    expect(normalizeLineup(4, [3, 1, 0, 2])).toEqual([3, 1, 0, 2])
    expect(normalizeLineup(4, [0, 0, 1, 2])).toEqual([0, 1, 2, 3])
    expect(normalizeLineup(4, [0, 1, 2])).toEqual([0, 1, 2, 3])
    expect(normalizeLineup(4, [0, 1, 2, 9])).toEqual([0, 1, 2, 3])
  })

  it('swapLineupPositions hoán đổi trong cùng team và chéo Half 1 <-> Half 2', () => {
    const base = [0, 1, 2, 3, 4, 5, 6, 7]
    expect(swapLineupPositions(base, 0, 5)).toEqual([5, 1, 2, 3, 4, 0, 6, 7])
    expect(swapLineupPositions(base, 2, 2)).toEqual(base)
    expect(swapLineupPositions(base, -1, 3)).toEqual(base)
  })

  it('swapTeams đổi nguyên Half 1 <-> Half 2 và xử lý team lẻ', () => {
    expect(swapTeams([0, 1, 2, 3, 4, 5, 6, 7])).toEqual([4, 5, 6, 7, 0, 1, 2, 3])
    expect(swapTeams([0, 1, 2, 3, 4, 5])).toEqual([4, 5, 2, 3, 0, 1])
    expect(swapTeams([0, 1, 2])).toEqual([0, 1, 2])
  })

  it('splitIntoTeams chia nhóm 4 nhân vật mỗi team', () => {
    expect(splitIntoTeams([])).toEqual([])
    expect(splitIntoTeams([0, 1, 2, 3, 4, 5, 6, 7])).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ])
    expect(splitIntoTeams([0, 1, 2, 3, 4, 5])).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ])
    expect(splitIntoTeams([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ])
  })

  it('computeCostBreakdown tách riêng tổng Cost nhân vật, vũ khí và giây tinh luyện', () => {
    const picks = [makePick(0, 2, 1.5, 10), makePick(1, 3.25, 1, 5), makePick(2, 0, 0, 0)]
    expect(computeCostBreakdown(picks)).toEqual({
      characterCost: 5.25,
      weaponCost: 2.5,
      weaponRefinementSeconds: 15,
    })
  })

  it('buildDraftBoardRows tách riêng khối Pick và Ban và giữ 2 hàng 4 ô khi lượt pick liên tục < 3', () => {
    const steps = createDefaultDraftSteps()
    const bluePicks = [makePick(0, 1, 0), makePick(1, 2, 0)]
    const rows = buildDraftBoardRows(
      steps,
      {
        blue: emptySide(bluePicks, ['amber', 'kaeya']),
        red: emptySide([], ['lisa']),
      },
      6,
      'drafting',
    )

    expect(getMaxConsecutivePicks(steps)).toBe(2)

    // Mỗi bên tách riêng pickRows (2 hàng x 4 ô) và banRows (2 ô trên, 1 ô dưới)
    expect(rows.blue.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(rows.blue.banRows.map((r) => r.length)).toEqual([2, 1])
    expect(rows.red.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(rows.red.banRows.map((r) => r.length)).toEqual([2, 1])

    // Bên Blue Pick đảo từ trong ra ngoài: Pick #1 (char-0) nằm gần tâm nhất ở hàng 1
    expect(rows.blue.pickRows[0].every((c) => c.action === 'pick')).toBe(true)
    expect(rows.blue.pickRows[0][3].characterSlug).toBe('char-0')
    expect(rows.blue.banRows[0][0].characterSlug).toBe('amber')

    // Bên Red: Ban gần tâm, Pick từ trong ra ngoài; Bước 7 (index 6) là Red Pick #2 -> đang active
    expect(rows.red.banRows[0][0].characterSlug).toBe('lisa')
    expect(rows.red.pickRows[0][1].step).toBe(7)
    expect(rows.red.pickRows[0][1].status).toBe('active')
  })

  it('buildDraftBoardRows chia hàng Pick theo chuỗi pick liên tục khi >= 3 lượt liên tục', () => {
    const makeSteps = (pattern: Array<['blue' | 'red', 'ban' | 'pick']>): DraftStep[] =>
      pattern.map(([side, action], idx) => ({ step: idx + 1, side, action }))

    // 3 lượt pick liên tục mỗi bên (8 pick mỗi bên -> 3 + 3 + 2)
    const steps3 = makeSteps([
      ['blue', 'ban'],
      ['red', 'ban'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
    ])
    expect(getMaxConsecutivePicks(steps3)).toBe(3)
    const board3 = buildDraftBoardRows(
      steps3,
      { blue: emptySide(), red: emptySide() },
      0,
      'drafting',
    )
    expect(board3.blue.pickRows.map((r) => r.length)).toEqual([3, 3, 2])
    expect(board3.red.pickRows.map((r) => r.length)).toEqual([3, 3, 2])
    // Blue hàng 1 đảo ngược từ trong ra ngoài (step 5, 4, 3)
    expect(board3.blue.pickRows[0].map((c) => c.step)).toEqual([5, 4, 3])
    expect(board3.red.pickRows[0].map((c) => c.step)).toEqual([6, 7, 8])

    // 4 lượt pick liên tục (10 pick mỗi bên -> 4 + 4 + 2)
    const steps4 = makeSteps([
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
    ])
    expect(getMaxConsecutivePicks(steps4)).toBe(4)
    const board4 = buildDraftBoardRows(
      steps4,
      { blue: emptySide(), red: emptySide() },
      0,
      'drafting',
    )
    expect(board4.blue.pickRows.map((r) => r.length)).toEqual([4, 4, 2])
    expect(board4.red.pickRows.map((r) => r.length)).toEqual([4, 4, 2])

    // 1 lượt pick luân phiên (< 3) -> vẫn 2 hàng 4 ô cho 8 pick
    const steps1 = makeSteps(
      Array.from({ length: 16 }, (_, i) => [i % 2 === 0 ? 'blue' : 'red', 'pick']),
    )
    expect(getMaxConsecutivePicks(steps1)).toBe(1)
    const board1 = buildDraftBoardRows(
      steps1,
      { blue: emptySide(), red: emptySide() },
      0,
      'drafting',
    )
    expect(board1.blue.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(board1.red.pickRows.map((r) => r.length)).toEqual([4, 4])
  })
})
