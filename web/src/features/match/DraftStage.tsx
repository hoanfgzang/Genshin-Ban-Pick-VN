import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ElementIcon } from '@/components/ui/ElementIcon'
import {
  ELEMENT_LABEL,
  ELEMENTS,
  type Element,
  type Rarity,
  type WeaponType,
  WEAPON_LABEL,
  WEAPONS,
} from '@/domain/character'
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
  onDraftAction: (characterSlug: string | null) => void
  onSelectPickSlot: (side: MatchSide, pick: MatchPickSlot) => void
  onUndoStep: () => void
  onRequestUndo: () => void
}

export function DraftStage({
  state,
  mySide,
  isAdmin,
  onDraftAction,
  onSelectPickSlot,
  onUndoStep,
  onRequestUndo,
}: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showQuickWeapons, setShowQuickWeapons] = useState(false)
  const [showUnownedForBan, setShowUnownedForBan] = useState(false)
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<Element | null>(null)
  const [weapon, setWeapon] = useState<WeaponType | null>(null)
  const [rarity, setRarity] = useState<Rarity | null>(null)

  const currentStep = state.ruleset.draftSteps[state.currentStepIndex] ?? null
  const isMyTurn = Boolean(currentStep && mySide === currentStep.side)
  const selectedChar = selectedSlug ? getCharacter(selectedSlug) : null

  const activeFilterCount =
    (query.trim() ? 1 : 0) + (element ? 1 : 0) + (weapon ? 1 : 0) + (rarity ? 1 : 0)

  const submitSlug = (slug: string | null) => {
    if (!isMyTurn) return
    onDraftAction(slug)
    setSelectedSlug(null)
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
      {/* Thanh thao tác trung tâm giống InMatch_UI.png: Trái (trạng thái) · Giữa (Weapons / Select / Filter) · Phải (Skip) */}
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

          <Button
            size="sm"
            variant={showFilters || activeFilterCount > 0 ? 'secondary' : 'ghost'}
            onClick={() => setShowFilters((v) => !v)}
          >
            Bộ lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDirectUndo && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedSlug(null)
                onUndoStep()
              }}
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

      {/* Thanh bộ lọc gọn cho cả 2 kho */}
      {showFilters && (
        <div className="panel flex flex-col gap-2 border-line/70 bg-bg/65 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên nhân vật ở cả 2 kho…"
              className="h-9 min-w-52 flex-1 rounded-lg border border-line bg-bg/70 px-3 text-sm text-text focus:border-gold focus:outline-none"
            />
            {([5, 4] as Rarity[]).map((r) => (
              <Chip key={r} active={rarity === r} onClick={() => setRarity((cur) => (cur === r ? null : r))}>
                {r}★
              </Chip>
            ))}
            {currentStep?.action === 'ban' && (
              <Chip active={showUnownedForBan} onClick={() => setShowUnownedForBan((v) => !v)}>
                Hiện thêm NV ngoài kho đối thủ
              </Chip>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setElement(null)
                  setWeapon(null)
                  setRarity(null)
                }}
                className="cursor-pointer px-2 text-xs font-semibold text-gold hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ELEMENTS.map((el) => (
              <Chip
                key={el}
                active={element === el}
                onClick={() => setElement((cur) => (cur === el ? null : el))}
              >
                <ElementIcon element={el} className="size-3.5" />
                {ELEMENT_LABEL[el]}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            {WEAPONS.map((wt) => (
              <Chip
                key={wt}
                active={weapon === wt}
                onClick={() => setWeapon((cur) => (cur === wt ? null : wt))}
              >
                {WEAPON_LABEL[wt]}
              </Chip>
            ))}
          </div>
        </div>
      )}

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
                                {wp ? `${wp.name} (R${p.refinement})` : '+ Gắn vũ khí'}
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

      {/* 2 kho nhân vật đặt song song */}
      <DualRosterGrid
        state={state}
        mode="interactive"
        selectedSlug={selectedSlug}
        query={query}
        element={element}
        weapon={weapon}
        rarity={rarity}
        showUnownedForBan={showUnownedForBan}
        onSelectCharacter={(slug) => {
          if (!isMyTurn) return
          setSelectedSlug((cur) => (cur === slug ? null : slug))
        }}
        onDoubleClickCharacter={(slug) => {
          if (!isMyTurn) return
          submitSlug(slug)
        }}
      />
    </div>
  )
}
