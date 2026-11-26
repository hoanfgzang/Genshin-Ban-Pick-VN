import { describe, expect, it } from 'vitest'
import {
  createDefaultDraftSteps,
  createDefaultRuleSetConfig,
  getStepBaseSeconds,
  splitDraftIntoPhases,
  validateDraftPhases,
  type DraftStep,
} from '@/domain/ruleset'
import type { MatchPickSlot, SideState } from '@/services'
import {
  buildDraftBoardRows,
  computeCostBreakdown,
  getDraftHighlightSets,
  getMaxConsecutivePicks,
  groupConsecutiveCells,
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

  it('buildDraftBoardRows chia hàng Pick và Ban theo từng Phase Ban/Pick (Luật chuẩn 4-4 và Luật Brox 3-3-2)', () => {
    const makeSteps = (pattern: Array<['blue' | 'red', 'ban' | 'pick']>): DraftStep[] =>
      pattern.map(([side, action], idx) => ({ step: idx + 1, side, action }))

    // Luật chuẩn 22 bước: 2 phase -> Pick [4, 4], Ban [2, 1]
    const defaultSteps = createDefaultDraftSteps()
    const defaultPhases = splitDraftIntoPhases(defaultSteps)
    expect(defaultPhases).toHaveLength(2)
    expect(validateDraftPhases(defaultSteps)).toEqual([])
    const defaultBoard = buildDraftBoardRows(
      defaultSteps,
      { blue: emptySide(), red: emptySide() },
      0,
      'drafting',
    )
    expect(defaultBoard.blue.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(defaultBoard.red.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(defaultBoard.blue.banRows.map((r) => r.length)).toEqual([2, 1])
    expect(defaultBoard.red.banRows.map((r) => r.length)).toEqual([2, 1])

    // Luật Brox 24 bước: 3 phase -> Pick [3, 3, 2], Ban [2, 1, 1] ở cả drafting & weapon_phase
    const broxSteps = makeSteps([
      ['blue', 'ban'],
      ['blue', 'ban'],
      ['red', 'ban'],
      ['red', 'ban'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'ban'],
      ['blue', 'ban'],
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
    ])

    const broxPhases = splitDraftIntoPhases(broxSteps)
    expect(broxPhases).toHaveLength(3)
    expect(validateDraftPhases(broxSteps)).toEqual([])

    for (const status of ['drafting', 'weapon_phase'] as const) {
      const broxBoard = buildDraftBoardRows(
        broxSteps,
        { blue: emptySide(), red: emptySide() },
        status === 'drafting' ? 0 : broxSteps.length,
        status,
      )
      expect(broxBoard.blue.pickRows.map((r) => r.map((c) => c.step))).toEqual([
        [9, 8, 5],
        [18, 15, 14],
        [24, 21],
      ])
      expect(broxBoard.red.pickRows.map((r) => r.map((c) => c.step))).toEqual([
        [6, 7, 10],
        [13, 16, 17],
        [22, 23],
      ])
      expect(broxBoard.blue.banRows.map((r) => r.map((c) => c.step))).toEqual([[1, 2], [12], [19]])
      expect(broxBoard.red.banRows.map((r) => r.map((c) => c.step))).toEqual([[3, 4], [11], [20]])
    }

    // Luật 1 phase không Ban -> 1 hàng duy nhất
    const singlePhaseSteps = makeSteps([
      ['blue', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['red', 'pick'],
    ])
    expect(validateDraftPhases(singlePhaseSteps)).toEqual([])
    const singleBoard = buildDraftBoardRows(
      singlePhaseSteps,
      { blue: emptySide(), red: emptySide() },
      0,
      'drafting',
    )
    expect(singleBoard.blue.pickRows.map((r) => r.length)).toEqual([2])
    expect(singleBoard.red.pickRows.map((r) => r.length)).toEqual([2])

    // validateDraftPhases phát hiện phase lệch số Ban giữa Xanh và Đỏ
    const invalidSteps = makeSteps([
      ['blue', 'ban'],
      ['blue', 'ban'],
      ['red', 'ban'],
      ['blue', 'pick'],
      ['red', 'pick'],
    ])
    expect(validateDraftPhases(invalidSteps)).toEqual([
      'Phase 1: số lượt Ban của đội Xanh (2) và đội Đỏ (1) phải bằng nhau.',
    ])
  })

  it('groupConsecutiveCells gom các lượt liên tiếp cùng bên & hành động, tách lượt không liên tiếp', () => {
    const steps = createDefaultDraftSteps()
    const rows = buildDraftBoardRows(
      steps,
      { blue: emptySide(), red: emptySide() },
      0,
      'drafting',
    )

    // Blue hàng 1 (đã đảo ngược): [12, 9, 8, 5] -> [12], [9, 8], [5]
    const blueGroups = groupConsecutiveCells(rows.blue.pickRows[0])
    expect(blueGroups.map((g) => g.map((c) => c.step))).toEqual([[12], [9, 8], [5]])

    // Red hàng 1: [6, 7, 10, 11] -> [6, 7], [10, 11]
    const redGroups = groupConsecutiveCells(rows.red.pickRows[0])
    expect(redGroups.map((g) => g.map((c) => c.step))).toEqual([
      [6, 7],
      [10, 11],
    ])
  })

  it('buildDraftBoardRows sau khi xong draft chia đều Pick 4-4 và Ban 2-2 dù pick theo nhịp 1-2-2-2-1', () => {
    const makeSteps = (pattern: Array<['blue' | 'red', 'ban' | 'pick']>): DraftStep[] =>
      pattern.map(([side, action], idx) => ({ step: idx + 1, side, action }))

    const steps = makeSteps([
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
    ])

    const bluePicks = Array.from({ length: 8 }, (_, i) => makePick(i, 0, 0))
    const redPicks = Array.from({ length: 8 }, (_, i) => makePick(i, 0, 0))
    const board = buildDraftBoardRows(
      steps,
      {
        blue: emptySide(bluePicks, ['a', 'b', 'c', 'd']),
        red: emptySide(redPicks, ['e', 'f', 'g', 'h']),
      },
      steps.length,
      'weapon_phase',
    )

    expect(board.blue.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(board.red.pickRows.map((r) => r.length)).toEqual([4, 4])
    expect(board.blue.banRows.map((r) => r.length)).toEqual([2, 2])
    expect(board.red.banRows.map((r) => r.length)).toEqual([2, 2])
  })

  it('getDraftHighlightSets xác định đúng nhóm đang active (sáng vàng) và nhóm chuẩn bị kế tiếp (xanh dương)', () => {
    const makeSteps = (pattern: Array<['blue' | 'red', 'ban' | 'pick']>): DraftStep[] =>
      pattern.map(([side, action], idx) => ({ step: idx + 1, side, action }))

    const steps = makeSteps([
      ['blue', 'ban'],
      ['blue', 'ban'],
      ['red', 'ban'],
      ['red', 'ban'],
      ['blue', 'pick'],
      ['red', 'pick'],
      ['red', 'pick'],
      ['blue', 'pick'],
      ['blue', 'pick'],
    ])

    // Đang ở bước 1 (Blue Ban 1-2 liền kề) -> 1 & 2 sáng vàng, 3 & 4 (Red Ban) chuẩn bị xanh dương
    const h0 = getDraftHighlightSets(steps, 0, 'drafting')
    expect(h0.activeStep).toBe(1)
    expect([...h0.activeGroupSteps]).toEqual([1, 2])
    expect([...h0.nextGroupSteps]).toEqual([3, 4])

    // Đang ở bước 5 (Blue Pick đơn) -> chỉ 5 sáng vàng, cặp 6 & 7 (Red Pick) chuẩn bị xanh dương
    const h4 = getDraftHighlightSets(steps, 4, 'drafting')
    expect(h4.activeStep).toBe(5)
    expect([...h4.activeGroupSteps]).toEqual([5])
    expect([...h4.nextGroupSteps]).toEqual([6, 7])

    // Đang ở bước 7 (ô thứ 2 trong cặp Red Pick 6-7) -> cả 6 & 7 sáng vàng, cặp 8 & 9 chuẩn bị
    const h6 = getDraftHighlightSets(steps, 6, 'drafting')
    expect(h6.activeStep).toBe(7)
    expect([...h6.activeGroupSteps]).toEqual([6, 7])
    expect([...h6.nextGroupSteps]).toEqual([8, 9])

    // Sau khi xong draft -> rỗng
    const hPost = getDraftHighlightSets(steps, 0, 'weapon_phase')
    expect(hPost.activeStep).toBeNull()
    expect(hPost.activeGroupSteps.size).toBe(0)
    expect(hPost.nextGroupSteps.size).toBe(0)
  })

  it('getStepBaseSeconds trả thời gian riêng của bước, hoặc mặc định Ban/Pick', () => {
    const cfg = createDefaultRuleSetConfig()
    cfg.banSeconds = 25
    cfg.pickSeconds = 55
    expect(getStepBaseSeconds(cfg, { step: 1, side: 'blue', action: 'ban' })).toBe(25)
    expect(getStepBaseSeconds(cfg, { step: 2, side: 'blue', action: 'pick' })).toBe(55)
    expect(getStepBaseSeconds(cfg, { step: 3, side: 'red', action: 'ban', seconds: 15 })).toBe(15)
  })
})
