import { describe, expect, it } from 'vitest'
import { createDefaultRuleSetConfig } from '@/domain/ruleset'
import type { CompletedGameRecord, MatchPickSlot, MatchPlayerInfo, MatchState } from '@/services'
import {
  countFourStarPicks,
  formatWinReason,
  getLockedCharactersByUser,
  getPreviousPicksByGameForUser,
  getPriorGames,
  getSeriesWinsForSide,
} from './series'

function makePlayer(userId: string, name: string): MatchPlayerInfo {
  return { userId, uid: `8000000${userId}`, displayName: name, ownedCount: 30 }
}

function makePick(slot: number, slug: string): MatchPickSlot {
  return {
    slot,
    characterSlug: slug,
    constellation: 0,
    level: 90,
    characterCost: 1,
    weaponSlug: null,
    refinement: 1,
    weaponCost: 0,
    weaponRefinementSeconds: 0,
    totalSlotCost: 1,
  }
}

function makeGameRecord(
  gameNumber: number,
  blueUser: MatchPlayerInfo,
  redUser: MatchPlayerInfo,
  blueSlugs: string[],
  redSlugs: string[],
  winnerSide: 'blue' | 'red' | 'draw' = 'blue',
): CompletedGameRecord {
  return {
    gameNumber,
    blue: {
      side: 'blue',
      player: blueUser,
      bans: [],
      picks: blueSlugs.map((s, i) => makePick(i, s)),
      totalCost: 2,
      costPenaltySeconds: 10,
      weaponRefinementSeconds: 0,
      overtimePenaltySeconds: 0,
      chamberTotalSeconds: 100,
      finalScore: 110,
      fourStarCount: 0,
    },
    red: {
      side: 'red',
      player: redUser,
      bans: [],
      picks: redSlugs.map((s, i) => makePick(i, s)),
      totalCost: 2,
      costPenaltySeconds: 10,
      weaponRefinementSeconds: 0,
      overtimePenaltySeconds: 0,
      chamberTotalSeconds: 120,
      finalScore: 130,
      fourStarCount: 1,
    },
    winnerSide,
    winnerUserId: winnerSide === 'blue' ? blueUser.userId : winnerSide === 'red' ? redUser.userId : null,
    winReason: winnerSide === 'draw' ? 'draw' : 'score',
    finishedAt: '2026-11-24T00:00:00Z',
  }
}

describe('features/match/series', () => {
  const playerA = makePlayer('1', 'Alpha')
  const playerB = makePlayer('2', 'Beta')
  // Game 1: A on blue, B on red; Game 2: B swapped to blue, A on red
  const history: CompletedGameRecord[] = [
    makeGameRecord(1, playerA, playerB, ['jean', 'lisa'], ['amber', 'kaeya'], 'blue'),
    makeGameRecord(2, playerB, playerA, ['diluc', 'jean'], ['bennett', 'fischl'], 'blue'),
  ]

  it('tracks locked characters per user across side swaps', () => {
    const lockedA = getLockedCharactersByUser(history, '1', 3)
    expect(lockedA.get('jean')).toBe(1)
    expect(lockedA.get('lisa')).toBe(1)
    expect(lockedA.get('bennett')).toBe(2)
    expect(lockedA.get('fischl')).toBe(2)
    expect(lockedA.has('diluc')).toBe(false)

    // Filtering before game 2 only locks game 1 picks
    const lockedABeforeG2 = getLockedCharactersByUser(history, '1', 2)
    expect(lockedABeforeG2.size).toBe(2)
    expect(lockedABeforeG2.has('bennett')).toBe(false)
  })

  it('returns previous picks by game for a user including side and win flag', () => {
    const histA = getPreviousPicksByGameForUser(history, '1', 3)
    expect(histA).toHaveLength(2)
    expect(histA[0]).toMatchObject({ gameNumber: 1, side: 'blue', isWinner: true })
    expect(histA[1]).toMatchObject({ gameNumber: 2, side: 'red', isWinner: false })
  })

  it('filters getPriorGames strictly below currentGame and resolves series wins by userId', () => {
    const state: MatchState = {
      code: 'BO3TST',
      status: 'drafting',
      rulesetId: 'rs-1',
      rulesetName: 'Default',
      ruleset: createDefaultRuleSetConfig(),
      hostUserId: '1',
      sides: {
        blue: {
          player: playerB,
          ready: true,
          ownedCharacters: {},
          bans: [],
          picks: [],
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
        },
        red: {
          player: playerA,
          ready: true,
          ownedCharacters: {},
          bans: [],
          picks: [],
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
        },
      },
      currentStepIndex: 0,
      turnDeadlineAt: null,
      winnerSide: null,
      format: 'bo3',
      maxGames: 3,
      winsToWin: 2,
      currentGame: 2,
      seriesScores: { '1': 1, '2': 0 },
      gameHistory: history,
      createdAt: '2026-11-24T00:00:00Z',
      finishedAt: null,
    }

    expect(getPriorGames(state).map((g) => g.gameNumber)).toEqual([1])
    expect(getSeriesWinsForSide(state, 'blue')).toBe(0)
    expect(getSeriesWinsForSide(state, 'red')).toBe(1)
  })

  it('counts 4-star picks and formats tie-break win reasons', () => {
    expect(countFourStarPicks([makePick(0, 'jean'), makePick(1, 'lisa'), makePick(2, 'amber')])).toBe(2)
    expect(formatWinReason('lower_cost')).toContain('Cost thấp hơn')
    expect(formatWinReason('fewer_4star')).toContain('4★ ít hơn')
    expect(formatWinReason('draw')).toContain('Hòa điểm')
    expect(formatWinReason('score')).toBeNull()
  })
})
