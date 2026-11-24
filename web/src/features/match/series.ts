import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import type {
  CompletedGameRecord,
  MatchPickSlot,
  MatchState,
  WinnerSide,
  WinReason,
} from '@/services'

export interface UserGamePickHistory {
  gameNumber: number
  side: MatchSide
  picks: MatchPickSlot[]
  winnerSide: WinnerSide
  isWinner: boolean
}

export function getPriorGames(state: MatchState): CompletedGameRecord[] {
  const current = state.currentGame ?? 1
  return [...(state.gameHistory ?? [])]
    .filter((g) => g.gameNumber < current)
    .sort((a, b) => a.gameNumber - b.gameNumber)
}

export function getLockedCharactersByUser(
  gameHistory: readonly CompletedGameRecord[] | undefined,
  userId: string | undefined,
  beforeGame?: number,
): Map<string, number> {
  const locked = new Map<string, number>()
  if (!gameHistory || !userId) return locked

  const sorted = [...gameHistory].sort((a, b) => a.gameNumber - b.gameNumber)
  for (const game of sorted) {
    if (beforeGame !== undefined && game.gameNumber >= beforeGame) continue
    for (const sideSummary of [game.blue, game.red]) {
      if (sideSummary.player?.userId === userId) {
        for (const pick of sideSummary.picks) {
          if (!locked.has(pick.characterSlug)) {
            locked.set(pick.characterSlug, game.gameNumber)
          }
        }
      }
    }
  }
  return locked
}

export function getPreviousPicksByGameForUser(
  gameHistory: readonly CompletedGameRecord[] | undefined,
  userId: string | undefined,
  beforeGame?: number,
): UserGamePickHistory[] {
  if (!gameHistory || !userId) return []

  const result: UserGamePickHistory[] = []
  const sorted = [...gameHistory].sort((a, b) => a.gameNumber - b.gameNumber)
  for (const game of sorted) {
    if (beforeGame !== undefined && game.gameNumber >= beforeGame) continue
    for (const side of ['blue', 'red'] as const) {
      const summary = game[side]
      if (summary.player?.userId === userId) {
        result.push({
          gameNumber: game.gameNumber,
          side,
          picks: summary.picks,
          winnerSide: game.winnerSide,
          isWinner: game.winnerSide === side,
        })
      }
    }
  }
  return result
}

export function getSeriesWinsForSide(state: MatchState, side: MatchSide): number {
  const uid = state.sides[side].player?.userId
  if (!uid) return 0
  return state.seriesScores?.[uid] ?? 0
}

export function countFourStarPicks(picks: readonly MatchPickSlot[]): number {
  let count = 0
  for (const p of picks) {
    if (getCharacter(p.characterSlug)?.rarity === 4) {
      count += 1
    }
  }
  return count
}

export function formatWinReason(reason: WinReason | null | undefined): string | null {
  switch (reason) {
    case 'lower_cost':
      return 'Thắng tie-break nhờ tổng Cost thấp hơn'
    case 'fewer_4star':
      return 'Thắng tie-break nhờ số nhân vật 4★ ít hơn'
    case 'draw':
      return 'Hòa điểm (sau khi đã xét điều kiện phụ)'
    default:
      return null
  }
}
