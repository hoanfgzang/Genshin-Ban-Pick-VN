import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { MatchSide } from '@/domain/ruleset'
import { getCharacter } from '@/domain/characters'
import { formatCost } from '@/domain/cost'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import { DualRosterGrid } from './DualRosterGrid'
import {
  normalizeLineup,
  splitIntoTeams,
  swapLineupPositions,
  swapTeams,
  TEAM_SIZE,
} from './lineup'
import { TeamSlotCard } from './TeamSlotCard'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  isAdmin: boolean
  canReorderSide: (side: MatchSide) => boolean
  canEditWeaponsForSide: (side: MatchSide) => boolean
  onReorderLineup: (side: MatchSide, order: number[]) => void
  onSelectWeaponSlot: (side: MatchSide, pick: MatchPickSlot) => void
  onLockWeapons: () => void
  onUndoStep: () => void
  onRequestUndo: () => void
}

export function PostDraftTeamsStage({
  state,
  mySide,
  isAdmin,
  canReorderSide,
  canEditWeaponsForSide,
  onReorderLineup,
  onSelectWeaponSlot,
  onLockWeapons,
  onUndoStep,
  onRequestUndo,
}: Props) {
  const [swapSource, setSwapSource] = useState<{ side: MatchSide; lineupIndex: number } | null>(null)
  const [dragState, setDragState] = useState<{
    side: MatchSide
    fromIndex: number
    overIndex: number | null
  } | null>(null)
  const [showRosters, setShowRosters] = useState(false)
  const [revealDone, setRevealDone] = useState(false)
  const [teamTabOverride, setTeamTabOverride] = useState<{
    status: string
    tab: 'blue' | 'red' | 'both'
  } | null>(null)
  const maxSideCards = Math.max(state.sides.blue.picks.length, state.sides.red.picks.length, 1)
  const tabScopeKey = `${state.currentGame ?? 1}-${state.status}-${mySide ?? 'spec'}`
  const defaultTeamTab: 'blue' | 'red' | 'both' =
    state.status === 'weapon_phase' && mySide ? mySide : 'both'
  const mobileTeamTab: 'blue' | 'red' | 'both' =
    teamTabOverride?.status === tabScopeKey ? teamTabOverride.tab : defaultTeamTab

  useEffect(() => {
    if (revealDone) return
    const timer = window.setTimeout(() => setRevealDone(true), (maxSideCards - 1) * 65 + 480)
    return () => window.clearTimeout(timer)
  }, [revealDone, maxSideCards])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSwapSource(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleCharacterClick = (side: MatchSide, lineupIndex: number, order: number[]) => {
    if (!canReorderSide(side)) return
    if (!swapSource || swapSource.side !== side) {
      setSwapSource({ side, lineupIndex })
      return
    }
    if (swapSource.lineupIndex === lineupIndex) {
      setSwapSource(null)
      return
    }
    const nextOrder = swapLineupPositions(order, swapSource.lineupIndex, lineupIndex)
    setSwapSource(null)
    onReorderLineup(side, nextOrder)
  }

  const renderSideTeams = (side: MatchSide) => {
    const sideState = state.sides[side]
    const isBlue = side === 'blue'
    const canReorder = canReorderSide(side)
    const canEditWeapon = canEditWeaponsForSide(side)
    const order = normalizeLineup(sideState.picks.length, sideState.lineup)
    const teams = splitIntoTeams(order, TEAM_SIZE)
    const useStagger = teams.length === 2
    const visibleMobile = mobileTeamTab === 'both' || mobileTeamTab === side

    return (
      <section
        className={cn(
          'panel flex-col gap-3 border-line/75 bg-bg/65 p-2.5 sm:p-3.5',
          visibleMobile ? 'flex' : 'hidden md:flex',
          isBlue ? 'border-hydro/40' : 'border-danger/40',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2 md:min-h-11 xl:min-h-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-extrabold uppercase',
                isBlue ? 'bg-hydro/20 text-hydro' : 'bg-danger/20 text-danger',
              )}
            >
              {isBlue ? 'Đội Xanh · Trái' : 'Đội Đỏ · Phải'}
            </span>
            <strong className="text-sm text-text">{sideState.player?.displayName ?? '—'}</strong>
            {canReorder && (
              <span className="rounded bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold-strong">
                {isAdmin && mySide !== side ? 'Admin: Sửa vị trí' : 'Kéo thả hoặc bấm để đổi vị trí'}
              </span>
            )}
          </div>

          {canReorder && teams.length >= 2 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSwapSource(null)
                onReorderLineup(side, swapTeams(order, 0, 1))
              }}
            >
              Đổi Half 1 ↔ Half 2
            </Button>
          )}
        </div>

        <div
          className={cn(
            'grid gap-4',
            teams.length >= 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1',
          )}
        >
          {teams.map((teamSlots, teamIdx) => {
            const label = teamIdx === 0 ? 'Half 1' : teamIdx === 1 ? 'Half 2' : `Team ${teamIdx + 1}`
            const labelOnTop = isBlue ? teamIdx % 2 === 1 : teamIdx % 2 === 0
            const staggerTop = useStagger && labelOnTop ? 'xl:mt-5' : ''

            const labelBadge = (
              <div
                className={cn(
                  'flex items-center justify-between gap-2 border-b border-line/40 pb-1 text-xs font-extrabold tracking-wider uppercase xl:justify-center xl:border-b-0 xl:pb-0',
                  isBlue ? 'text-hydro' : 'text-danger',
                )}
              >
                <span>{label}</span>
                <span className="text-[10px] font-medium text-muted">({teamSlots.length} NV)</span>
              </div>
            )

            return (
              <div key={teamIdx} className={cn('flex flex-col gap-2', staggerTop)}>
                <div className={cn(!labelOnTop && 'xl:hidden')}>{labelBadge}</div>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {teamSlots.map((pickIndex, posInTeam) => {
                    const lineupIndex = teamIdx * TEAM_SIZE + posInTeam
                    const pick = sideState.picks[pickIndex]
                    if (!pick) return null
                    const isSelectedForSwap =
                      swapSource?.side === side && swapSource.lineupIndex === lineupIndex
                    const isDropTarget =
                      dragState?.side === side &&
                      dragState.overIndex === lineupIndex &&
                      dragState.fromIndex !== lineupIndex
                    const totalSideCards = order.length
                    const revealOrder = isBlue ? totalSideCards - 1 - lineupIndex : lineupIndex

                    return (
                      <div
                        key={pick.slot}
                        className={cn(
                          'min-w-0',
                          !revealDone && (isBlue ? 'team-card-reveal-blue' : 'team-card-reveal-red'),
                        )}
                        style={!revealDone ? { animationDelay: `${revealOrder * 65}ms` } : undefined}
                      >
                        <TeamSlotCard
                          pick={pick}
                          slotInTeam={posInTeam + 1}
                          ownedCharacters={sideState.ownedCharacters}
                          costRules={state.ruleset.costRules}
                          canReorder={canReorder}
                          canEditWeapon={canEditWeapon}
                          isSelectedForSwap={isSelectedForSwap}
                          isDropTarget={isDropTarget}
                          onClickCharacter={() => handleCharacterClick(side, lineupIndex, order)}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', `${side}:${lineupIndex}`)
                            setSwapSource(null)
                            setDragState({ side, fromIndex: lineupIndex, overIndex: null })
                          }}
                          onDragOver={(e) => {
                            if (!dragState || dragState.side !== side) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (dragState.overIndex !== lineupIndex) {
                              setDragState((cur) => (cur ? { ...cur, overIndex: lineupIndex } : null))
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (!dragState || dragState.side !== side) return
                            const fromIdx = dragState.fromIndex
                            setDragState(null)
                            if (fromIdx !== lineupIndex) {
                              onReorderLineup(side, swapLineupPositions(order, fromIdx, lineupIndex))
                            }
                          }}
                          onDragEnd={() => setDragState(null)}
                          onClickWeapon={() => onSelectWeaponSlot(side, pick)}
                        />
                      </div>
                    )
                  })}
                </div>
                {!labelOnTop && <div className="hidden xl:block">{labelBadge}</div>}
              </div>
            )
          })}
        </div>

        {sideState.picks.some((p) => p.characterCustomCostNote || p.weaponCustomCostNote) && (
          <div className="rounded-lg border border-hydro/35 bg-hydro/5 px-3 py-2 text-[11px]">
            <div className="mb-1 font-bold text-hydro">Custom Cost đang áp dụng:</div>
            <ul className="space-y-0.5 text-text">
              {sideState.picks.flatMap((p) => {
                const items: string[] = []
                if (p.characterCustomCostNote) {
                  const chName = getCharacter(p.characterSlug)?.name ?? p.characterSlug
                  items.push(
                    `• ${chName} (C${p.constellation} · ${formatCost(p.characterCost)} cost): ${p.characterCustomCostNote}`,
                  )
                }
                if (p.weaponCustomCostNote && p.weaponSlug) {
                  const wpName = getWeapon(p.weaponSlug)?.name ?? p.weaponSlug
                  items.push(
                    `• ${wpName} (R${p.refinement} · ${formatCost(p.weaponCost)} cost): ${p.weaponCustomCostNote}`,
                  )
                }
                return items.map((line, i) => <li key={`${p.slot}-${i}`}>{line}</li>)
              })}
            </ul>
          </div>
        )}
      </section>
    )
  }

  const swapCharName = (() => {
    if (!swapSource) return null
    const order = normalizeLineup(
      state.sides[swapSource.side].picks.length,
      state.sides[swapSource.side].lineup,
    )
    const pickIdx = order[swapSource.lineupIndex]
    const pick = state.sides[swapSource.side].picks[pickIdx]
    return pick ? (getCharacter(pick.characterSlug)?.name ?? pick.characterSlug) : null
  })()

  const mySideState = mySide ? state.sides[mySide] : null
  const totalPicks = mySideState?.picks.length ?? 0
  const filledWeapons = mySideState?.picks.filter((p) => Boolean(p.weaponSlug)).length ?? 0
  const canLock = Boolean(mySideState && !mySideState.weaponsLocked)

  return (
    <div className="flex flex-col gap-3">
      {swapSource && swapCharName && (
        <div
          role="status"
          className="panel flex flex-wrap items-center justify-between gap-2 border-gold/60 bg-gold/10 px-4 py-2 text-xs text-text"
        >
          <span>
            Đang chọn <strong className="text-gold-strong">{swapCharName}</strong> — bấm vào nhân vật
            khác cùng đội để hoán đổi vị trí/team (nhấn <kbd className="rounded bg-bg px-1.5 py-0.5">Esc</kbd> để hủy).
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSwapSource(null)}>
            Hủy chọn
          </Button>
        </div>
      )}

      {/* Thanh hành động: Khóa vũ khí (khi ở weapon_phase) + Nút ROSTERS (trên ở mobile/iPad, dưới ở desktop) */}
      <div className="panel order-1 flex flex-wrap items-center justify-between gap-2.5 border-line/70 bg-bg/65 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 xl:order-2">
        <div className="text-xs text-muted">
          {state.status === 'weapon_phase' ? (
            mySideState ? (
              <span>
                Vũ khí đã chọn:{' '}
                <strong className={filledWeapons === totalPicks ? 'text-success' : 'text-gold-strong'}>
                  {filledWeapons} / {totalPicks}
                </strong>{' '}
                <span className="text-muted">
                  (ô trống tự tính vũ khí 4★ · 0 cost, có thể khóa ngay)
                </span>
                {isAdmin && ' · Admin có thể chỉnh vũ khí & vị trí cho cả 2 bên.'}
              </span>
            ) : (
              <span>
                {isAdmin
                  ? 'Chế độ Admin: bạn có thể sắp xếp lại vị trí & chỉnh vũ khí cho cả 2 bên.'
                  : 'Đang chờ hai người chơi hoàn tất vũ khí và sắp xếp đội hình…'}
              </span>
            )
          ) : (
            <span>
              {isAdmin
                ? 'Chế độ Admin: vẫn có thể điều chỉnh lại vị trí/team của cả 2 bên.'
                : state.status === 'scoring'
                  ? 'Đội hình hiển thị theo thứ tự bạn đã sắp xếp (có thể điều chỉnh lại trước khi kết thúc).'
                  : state.status === 'between_games'
                    ? 'Ván đấu đã hoàn tất — hãy chọn bên và sẵn sàng ván tiếp theo ở phía trên.'
                    : 'Trận đấu đã kết thúc.'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state.status === 'weapon_phase' && isAdmin && (
            <Button size="sm" variant="secondary" onClick={onUndoStep}>
              Admin: Lùi về Ban/Pick
            </Button>
          )}
          {state.status === 'weapon_phase' && !isAdmin && mySide && (
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(state.undoRequest)}
              onClick={onRequestUndo}
            >
              {state.undoRequest?.requesterSide === mySide ? 'Đang chờ đồng ý…' : 'Xin lùi 1 hành động'}
            </Button>
          )}
          {state.status === 'weapon_phase' && mySideState && (
            mySideState.weaponsLocked ? (
              <span className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success">
                Đã khóa vũ khí · Đang chờ đối thủ…
              </span>
            ) : (
              <Button size="sm" variant="primary" disabled={!canLock} onClick={onLockWeapons}>
                Khóa Vũ Khí & Sang Tính Điểm
              </Button>
            )
          )}

          <Button
            size="sm"
            variant={showRosters ? 'secondary' : 'ghost'}
            onClick={() => setShowRosters((v) => !v)}
            className="border border-line font-bold tracking-wider uppercase"
          >
            ROSTERS {showRosters ? '⌃' : '⌄'}
          </Button>
        </div>
      </div>

      {/* Bộ chuyển nhanh giữa 2 đội hình trên Mobile (< md) */}
      <div
        role="tablist"
        aria-label="Chọn đội hình hiển thị"
        className="order-2 grid min-h-11 grid-cols-3 gap-1 rounded-xl border border-line/65 bg-bg p-1 md:hidden"
      >
        {(
          [
            ['blue', 'Đội Xanh'],
            ['red', 'Đội Đỏ'],
            ['both', 'Cả 2 đội'],
          ] as const
        ).map(([tab, label]) => {
          const active = mobileTeamTab === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTeamTabOverride({ status: tabScopeKey, tab })}
              className={cn(
                'min-h-9 cursor-pointer rounded-lg px-2 text-xs font-medium transition-colors',
                active
                  ? tab === 'blue'
                    ? 'bg-panel-2 font-semibold text-hydro ring-1 ring-hydro/40'
                    : tab === 'red'
                      ? 'bg-panel-2 font-semibold text-danger ring-1 ring-danger/40'
                      : 'bg-panel-2 font-semibold text-gold-strong ring-1 ring-gold/40'
                  : 'text-muted hover:text-text',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Đội hình 2 bên (Half 1 & Half 2, mỗi team 4 nhân vật) */}
      <div className="order-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 xl:order-1">
        {renderSideTeams('blue')}
        {renderSideTeams('red')}
      </div>

      {showRosters && (
        <div className="order-4">
          <DualRosterGrid state={state} mode="readonly" />
        </div>
      )}
    </div>
  )
}
