import { ElementIcon } from '@/components/ui/ElementIcon'
import { resolveCharacterForOwned } from '@/domain/traveler'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState } from '@/services'
import { getLockedCharactersByUser, getPreviousPicksByGameForUser } from './series'

interface Props {
  state: MatchState
}

export function PreviousGamesPicksPanel({ state }: Props) {
  if (state.format !== 'bo3') return null

  const renderPlayerColumn = (side: MatchSide) => {
    const sideState = state.sides[side]
    const player = sideState.player
    const isBlue = side === 'blue'
    const games = getPreviousPicksByGameForUser(
      state.gameHistory,
      player?.userId,
      state.currentGame,
    )
    const lockedCount = getLockedCharactersByUser(
      state.gameHistory,
      player?.userId,
      state.currentGame,
    ).size

    if (games.length === 0) return null

    return (
      <div
        className={cn(
          'panel flex flex-col gap-3 border-line/75 bg-bg/60 p-3.5',
          isBlue ? 'border-hydro/35' : 'border-danger/35',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase',
                isBlue ? 'bg-hydro/20 text-hydro' : 'bg-danger/20 text-danger',
              )}
            >
              {isBlue ? 'Trái · Blue' : 'Phải · Red'}
            </span>
            <h4 className="text-sm font-bold text-text">{player?.displayName ?? '—'}</h4>
          </div>
          <span className="rounded bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold-strong">
            Đã khóa {lockedCount} NV
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {games.map((g) => (
            <div key={g.gameNumber} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gold-strong">Ván {g.gameNumber}</span>
                  <span className="text-[11px] text-muted">
                    ({g.side === 'blue' ? 'Đội Xanh' : 'Đội Đỏ'})
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-bold',
                    g.winnerSide === 'draw'
                      ? 'bg-panel-2 text-muted'
                      : g.isWinner
                        ? 'bg-success/15 text-success'
                        : 'bg-danger/15 text-danger',
                  )}
                >
                  {g.winnerSide === 'draw' ? 'Hòa' : g.isWinner ? 'Thắng' : 'Thua'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 xl:grid-cols-8">
                {g.picks.map((pick) => {
                  const ch = resolveCharacterForOwned(pick.characterSlug, sideState.ownedCharacters)
                  return (
                    <div
                      key={`${g.gameNumber}-${pick.slot}`}
                      title={`${ch?.name ?? pick.characterSlug} · Lv${pick.level} · C${pick.constellation} (Đã pick ở Ván ${g.gameNumber})`}
                      className="flex flex-col overflow-hidden rounded border border-line/70 bg-bg/70"
                    >
                      <div
                        className={cn(
                          'relative aspect-square w-full bg-gradient-to-br',
                          ch?.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
                        )}
                      >
                        {ch && (
                          <img
                            src={ch.icon}
                            alt={ch.name}
                            loading="lazy"
                            className="size-full object-cover opacity-85"
                          />
                        )}
                        {ch?.element && (
                          <ElementIcon
                            element={ch.element}
                            className="absolute top-0.5 left-0.5 size-3"
                          />
                        )}
                      </div>
                      <div className="truncate bg-white px-1 py-0.5 text-center text-[10px] font-semibold text-black">
                        {ch?.name ?? pick.characterSlug}
                      </div>
                      <div className="bg-black/75 py-0.5 text-center font-mono text-[9px] font-bold text-muted">
                        Lv{pick.level} | C{pick.constellation}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const blueHasHistory =
    getPreviousPicksByGameForUser(
      state.gameHistory,
      state.sides.blue.player?.userId,
      state.currentGame,
    ).length > 0
  const redHasHistory =
    getPreviousPicksByGameForUser(
      state.gameHistory,
      state.sides.red.player?.userId,
      state.currentGame,
    ).length > 0

  if (!blueHasHistory && !redHasHistory) return null

  return (
    <section
      aria-label="Nhân vật đã pick ở các ván trước"
      className="panel flex flex-col gap-3 border-gold/30 bg-bg/55 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-gold-strong">
            Nhân vật đã Pick ở các ván trước
          </h3>
          <p className="text-xs text-muted">
            Các nhân vật dưới đây bị khóa không thể pick lại cho chính người chơi đó (đối thủ vẫn
            có thể pick và vẫn có thể Ban).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderPlayerColumn('blue')}
        {renderPlayerColumn('red')}
      </div>
    </section>
  )
}
