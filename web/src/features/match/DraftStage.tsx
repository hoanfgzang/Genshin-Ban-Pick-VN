import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { calcCharacterCost, formatCost } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import {
  getOwnedTraveler,
  isTravelerElementSlug,
  resolveCharacterForOwned,
} from '@/domain/traveler'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import { DualRosterGrid } from './DualRosterGrid'
import { getLockedCharactersByUser } from './series'
import { TravelerElementDialog } from './TravelerElementDialog'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  isAdmin: boolean
  countdown?: number | null
  selectedSlug: string | null
  onSelectSlug: (slug: string | null) => void
  onDraftAction: (characterSlug: string | null) => void
  onSelectPickSlot: (side: MatchSide, pick: MatchPickSlot) => void
  onUndoStep: () => void
  onRequestUndo: () => void
}

export function DraftStage({
  state,
  mySide,
  isAdmin,
  countdown = null,
  selectedSlug,
  onSelectSlug,
  onDraftAction,
  onSelectPickSlot,
  onUndoStep,
  onRequestUndo,
}: Props) {
  const [showQuickWeapons, setShowQuickWeapons] = useState(false)
  const [travelerDialog, setTravelerDialog] = useState<{
    side: MatchSide
    autoSubmit: boolean
  } | null>(null)

  const currentStep = state.ruleset.draftSteps[state.currentStepIndex] ?? null
  const isMyTurn = Boolean(currentStep && mySide === currentStep.side)
  const activeOwnedForSelected = currentStep
    ? currentStep.action === 'ban'
      ? state.sides[currentStep.side === 'blue' ? 'red' : 'blue'].ownedCharacters
      : state.sides[currentStep.side].ownedCharacters
    : null
  const selectedChar = selectedSlug
    ? resolveCharacterForOwned(
        selectedSlug,
        activeOwnedForSelected,
        currentStep ? state.sides[currentStep.side].ownedCharacters : null,
      ) ?? null
    : null

  const submitSlug = (slug: string | null) => {
    if (!isMyTurn) return
    setTravelerDialog(null)
    onDraftAction(slug)
  }

  const ownedInActiveSide =
    currentStep && selectedSlug
      ? isTravelerElementSlug(selectedSlug)
        ? getOwnedTraveler(state.sides[currentStep.side].ownedCharacters)?.entry ?? null
        : state.sides[currentStep.side].ownedCharacters[selectedSlug] ?? null
      : null
  const previewCost =
    selectedSlug && ownedInActiveSide
      ? calcCharacterCost(selectedSlug, ownedInActiveSide.constellation, state.ruleset.costRules)
      : null

  const bannedSet = useMemo(() => {
    const s = new Set<string>()
    for (const sideKey of ['blue', 'red'] as const) {
      for (const slug of state.sides[sideKey].bans) {
        if (slug) s.add(slug)
      }
    }
    return s
  }, [state.sides])

  const allPickedSet = useMemo(() => {
    const s = new Set<string>()
    for (const sideKey of ['blue', 'red'] as const) {
      for (const p of state.sides[sideKey].picks) {
        s.add(p.characterSlug)
      }
    }
    return s
  }, [state.sides])

  const weaponEditableSides: MatchSide[] = isAdmin
    ? ['blue', 'red']
    : mySide && !state.sides[mySide].weaponsLocked
      ? [mySide]
      : []

  const canDirectUndo = state.currentStepIndex > 0 && (isAdmin || isMyTurn)
  const hasMyCompletedStep = Boolean(
    mySide &&
      state.ruleset.draftSteps.slice(0, state.currentStepIndex).some((s) => s.side === mySide),
  )
  const showRequestUndo = Boolean(mySide && !isMyTurn && !isAdmin)

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      {/* Thanh thao tác trung tâm: Trái (trạng thái) · Giữa (Vũ khí / Xác nhận) · Phải (Lùi / Bỏ qua) */}
      <div className="panel flex flex-wrap items-center justify-between gap-2 border-line/80 bg-bg/70 px-3 py-2 xl:gap-3 xl:px-4 xl:py-2.5">
        <div className="min-w-0 flex-1 text-xs sm:text-sm xl:min-w-48 xl:flex-initial">
          {currentStep ? (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span
                className={cn(
                  'font-extrabold',
                  currentStep.side === 'blue' ? 'text-hydro' : 'text-danger',
                )}
              >
                Đội {currentStep.side === 'blue' ? 'Xanh' : 'Đỏ'}
              </span>
              <span className="text-muted">đang</span>
              <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[11px] font-extrabold uppercase text-gold-strong sm:px-2 sm:text-xs">
                {currentStep.action}
              </span>
              {isMyTurn ? (
                selectedChar ? (
                  <span className="hidden text-text xl:inline">
                    · Đã chọn <strong className="text-gold-strong">{selectedChar.name}</strong>
                    {previewCost !== null ? ` (+${formatCost(previewCost)} cost)` : ''}
                  </span>
                ) : (
                  <span className="text-gold-strong">· Lượt của bạn!</span>
                )
              ) : selectedChar ? (
                <span className="hidden text-text xl:inline">
                  · Đang nhắm <strong className="text-gold-strong">{selectedChar.name}</strong>
                </span>
              ) : (
                <span className="text-muted">· Đang chờ người chơi…</span>
              )}
            </div>
          ) : (
            <span className="text-muted">Đang chờ bắt đầu…</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {weaponEditableSides.length > 0 && (
            <Button
              size="sm"
              variant={showQuickWeapons ? 'secondary' : 'ghost'}
              onClick={() => setShowQuickWeapons((v) => !v)}
            >
              Vũ khí {showQuickWeapons ? '▴' : '▾'}
            </Button>
          )}

          <Button
            size="md"
            variant="primary"
            disabled={!isMyTurn || !selectedSlug}
            onClick={() => submitSlug(selectedSlug)}
            className="hidden min-w-36 font-extrabold uppercase tracking-wide xl:inline-flex"
          >
            {currentStep?.action === 'ban' ? 'Xác nhận BAN' : 'Xác nhận PICK'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDirectUndo && (
            <Button size="sm" variant="secondary" onClick={onUndoStep}>
              {isAdmin && !isMyTurn ? 'Admin: Lùi lượt' : 'Lùi lượt trước'}
            </Button>
          )}
          {showRequestUndo && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!hasMyCompletedStep || Boolean(state.undoRequest)}
              onClick={onRequestUndo}
            >
              {state.undoRequest?.requesterSide === mySide ? 'Đang chờ đồng ý…' : 'Xin lùi 1 hành động'}
            </Button>
          )}
          {isMyTurn && currentStep?.action === 'ban' && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => submitSlug(null)}
              className="hidden xl:inline-flex"
            >
              Bỏ qua lượt Ban
            </Button>
          )}
        </div>
      </div>

      {/* Bảng gán nhanh vũ khí trong lúc đang chờ lượt Draft */}
      {showQuickWeapons && weaponEditableSides.length > 0 && (
        <div className="panel flex flex-col gap-3 border-gold/40 bg-bg/75 p-3">
          <div className="text-xs font-semibold text-gold-strong">
            Gắn sớm Vũ khí cho các nhân vật đã Pick (chọn ô nhân vật để mở danh sách vũ khí):
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {weaponEditableSides.map((s) => {
              const picks = state.sides[s].picks
              return (
                <div key={s} className="flex flex-col gap-1.5">
                  <div className={cn('text-xs font-bold', s === 'blue' ? 'text-hydro' : 'text-danger')}>
                    Đội {s === 'blue' ? 'Xanh' : 'Đỏ'} ({picks.length} nhân vật đã Pick)
                  </div>
                  {picks.length === 0 ? (
                    <div className="text-xs text-muted">Chưa Pick nhân vật nào.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {picks.map((p) => {
                        const ch = resolveCharacterForOwned(p.characterSlug, state.sides[s].ownedCharacters)
                        const wp = p.weaponSlug ? getWeapon(p.weaponSlug) : null
                        return (
                          <button
                            key={p.slot}
                            type="button"
                            onClick={() => onSelectPickSlot(s, p)}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel-2/80 px-2.5 py-1.5 text-left text-xs transition hover:border-gold"
                          >
                            {ch && <img src={ch.icon} alt="" className="size-7 rounded object-cover" />}
                            <div>
                              <div className="font-semibold text-text">{ch?.name ?? p.characterSlug}</div>
                              <div className={wp ? 'text-[10px] text-gold-strong' : 'text-[10px] text-muted'}>
                                {wp ? `${wp.name} (R${p.refinement})` : 'Mặc định 4★ (0 cost)'}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 2 kho nhân vật đặt song song kèm tìm kiếm, filter hệ và sort */}
      <DualRosterGrid
        state={state}
        mode="interactive"
        selectedSlug={selectedSlug}
        onSelectCharacter={(slug) => {
          if (!isMyTurn) return
          onSelectSlug(selectedSlug === slug ? null : slug)
        }}
        onDoubleClickCharacter={(slug) => {
          if (!isMyTurn) return
          submitSlug(slug)
        }}
        onRequestTravelerElement={(side, autoSubmit) => {
          if (!isMyTurn) return
          setTravelerDialog({ side, autoSubmit })
        }}
      />

      {travelerDialog && currentStep && isMyTurn && (() => {
        const dialogSideState = state.sides[travelerDialog.side]
        const dialogOwnedTraveler = getOwnedTraveler(dialogSideState.ownedCharacters)
        const dialogGender = dialogOwnedTraveler?.slug ?? 'traveler-boy'
        const actorSideState = state.sides[currentStep.side]
        const actorOwnedTraveler = getOwnedTraveler(actorSideState.ownedCharacters)
        const constellationForDialog =
          currentStep.action === 'pick'
            ? (actorOwnedTraveler?.entry.constellation ?? null)
            : (dialogOwnedTraveler?.entry.constellation ?? null)
        const lockedByPriorGame = getLockedCharactersByUser(
          state.gameHistory,
          actorSideState.player?.userId,
          state.currentGame,
        )
        const sideHasPickedTraveler = actorSideState.picks.some((p) =>
          isTravelerElementSlug(p.characterSlug),
        )

        return (
          <TravelerElementDialog
            open
            action={currentStep.action}
            genderSlug={dialogGender}
            constellation={constellationForDialog}
            costRules={state.ruleset.costRules}
            bannedSet={bannedSet}
            allPickedSet={allPickedSet}
            lockedByPriorGame={lockedByPriorGame}
            allowDuplicatePick={state.ruleset.allowDuplicatePick}
            sideHasPickedTraveler={sideHasPickedTraveler}
            currentSelectedSlug={selectedSlug}
            autoSubmit={travelerDialog.autoSubmit}
            onSelectElement={(elSlug) => onSelectSlug(elSlug)}
            onConfirmElement={(elSlug) => submitSlug(elSlug)}
            onClearSelection={() => onSelectSlug(null)}
            onClose={() => setTravelerDialog(null)}
          />
        )
      })()}

      {/* Thanh xác nhận nổi ở đáy màn hình cho Mobile & iPad (< xl) */}
      <div className="sticky bottom-2 z-20 pb-[env(safe-area-inset-bottom)] xl:hidden">
        <div className="panel flex items-center justify-between gap-2.5 border-gold/45 bg-panel px-3 py-2.5 shadow-xl sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {selectedChar ? (
              <>
                <img
                  src={selectedChar.icon}
                  alt=""
                  className="size-10 shrink-0 rounded-lg border border-gold/50 object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-gold-strong">
                    {selectedChar.name}
                  </div>
                  <div className="text-xs text-muted">
                    {previewCost !== null ? `+${formatCost(previewCost)} cost` : currentStep?.action.toUpperCase()}
                    {countdown !== null && (
                      <span
                        className={cn(
                          'ml-1.5 font-mono font-bold tabular-nums',
                          countdown < 0 ? 'text-danger' : 'text-text',
                        )}
                      >
                        · {countdown < 0 ? `-${Math.abs(countdown)}s` : `${countdown}s`}
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-text sm:text-sm">
                  {isMyTurn ? (
                    <span className="text-gold-strong">Lượt bạn: chạm chọn 1 nhân vật</span>
                  ) : (
                    <span className="text-muted">
                      Đang chờ Đội {currentStep?.side === 'blue' ? 'Xanh' : 'Đỏ'}…
                    </span>
                  )}
                </div>
                {countdown !== null && (
                  <div
                    className={cn(
                      'font-mono text-xs font-bold tabular-nums',
                      countdown < 0 ? 'text-danger' : 'text-muted',
                    )}
                  >
                    Thời gian: {countdown < 0 ? `-${Math.abs(countdown)}s` : `${countdown}s`}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isMyTurn && currentStep?.action === 'ban' && (
              <Button size="md" variant="danger" onClick={() => submitSlug(null)} className="px-3">
                Bỏ qua
              </Button>
            )}
            <Button
              size="md"
              variant="primary"
              disabled={!isMyTurn || !selectedSlug}
              onClick={() => submitSlug(selectedSlug)}
              className="px-3.5 font-bold uppercase sm:px-5"
            >
              {currentStep?.action === 'ban' ? 'Xác nhận BAN' : 'Xác nhận PICK'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
