import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { getCharacter } from '@/domain/characters'
import { calcCharacterCost, formatCost } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import { DualRosterGrid } from './DualRosterGrid'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  isAdmin: boolean
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
  selectedSlug,
  onSelectSlug,
  onDraftAction,
  onSelectPickSlot,
  onUndoStep,
  onRequestUndo,
}: Props) {
  const [showQuickWeapons, setShowQuickWeapons] = useState(false)

  const currentStep = state.ruleset.draftSteps[state.currentStepIndex] ?? null
  const isMyTurn = Boolean(currentStep && mySide === currentStep.side)
  const selectedChar = selectedSlug ? getCharacter(selectedSlug) : null

  const submitSlug = (slug: string | null) => {
    if (!isMyTurn) return
    onDraftAction(slug)
  }

  const ownedInActiveSide =
    currentStep && selectedSlug ? state.sides[currentStep.side].ownedCharacters[selectedSlug] : null
  const previewCost =
    selectedSlug && ownedInActiveSide
      ? calcCharacterCost(selectedSlug, ownedInActiveSide.constellation, state.ruleset.costRules)
      : null

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
    <div className="flex flex-col gap-3">
      {/* Thanh thao tác trung tâm: Trái (trạng thái) · Giữa (Vũ khí / Xác nhận) · Phải (Lùi / Bỏ qua) */}
      <div className="panel flex flex-wrap items-center justify-between gap-3 border-line/80 bg-bg/70 px-4 py-2.5">
        <div className="min-w-48 text-sm">
          {currentStep ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'font-extrabold',
                  currentStep.side === 'blue' ? 'text-hydro' : 'text-danger',
                )}
              >
                Đội {currentStep.side === 'blue' ? 'Xanh' : 'Đỏ'}
              </span>
              <span className="text-muted">đang</span>
              <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-extrabold uppercase text-gold-strong">
                {currentStep.action}
              </span>
              {isMyTurn ? (
                selectedChar ? (
                  <span className="text-text">
                    · Đã chọn <strong className="text-gold-strong">{selectedChar.name}</strong>
                    {previewCost !== null ? ` (+${formatCost(previewCost)} cost)` : ''}
                  </span>
                ) : (
                  <span className="text-gold-strong">· Lượt của bạn!</span>
                )
              ) : selectedChar ? (
                <span className="text-text">
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
            className="min-w-36 font-extrabold uppercase tracking-wide"
          >
            {currentStep?.action === 'ban' ? 'Xác nhận BAN' : 'Xác nhận PICK'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDirectUndo && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onUndoStep}
            >
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
            <Button size="sm" variant="danger" onClick={() => submitSlug(null)}>
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
                        const ch = getCharacter(p.characterSlug)
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
      />
    </div>
  )
}
