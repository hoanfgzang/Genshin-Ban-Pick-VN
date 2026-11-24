import { useMemo, useState } from 'react'
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
import { CHARACTERS, getCharacter } from '@/domain/characters'
import { calcCharacterCost, formatCost } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState } from '@/services'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  countdown: number | null
  onDraftAction: (characterSlug: string | null) => void
  onLockWeapons: () => void
}

export function DraftCenterPool({
  state,
  mySide,
  countdown,
  onDraftAction,
  onLockWeapons,
}: Props) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<Element | null>(null)
  const [weapon, setWeapon] = useState<WeaponType | null>(null)
  const [rarity, setRarity] = useState<Rarity | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const currentStep =
    state.status === 'drafting' ? state.ruleset.draftSteps[state.currentStepIndex] ?? null : null
  const isMyTurn = !!currentStep && mySide === currentStep.side
  const activeSideState = currentStep ? state.sides[currentStep.side] : null

  const bannedSet = useMemo(() => {
    const s = new Set<string>()
    for (const side of ['blue', 'red'] as const) {
      for (const slug of state.sides[side].bans) {
        if (slug) s.add(slug)
      }
    }
    return s
  }, [state.sides])

  const allPickedSet = useMemo(() => {
    const s = new Set<string>()
    for (const side of ['blue', 'red'] as const) {
      for (const p of state.sides[side].picks) {
        s.add(p.characterSlug)
      }
    }
    return s
  }, [state.sides])

  const ownPickedSet = useMemo(() => {
    if (!currentStep) return new Set<string>()
    return new Set(state.sides[currentStep.side].picks.map((p) => p.characterSlug))
  }, [currentStep, state.sides])

  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CHARACTERS.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.slug.includes(q)) return false
      if (element && c.element !== element) return false
      if (weapon && c.weapon !== weapon) return false
      if (rarity && c.rarity !== rarity) return false
      return true
    })
  }, [query, element, weapon, rarity])

  if (state.status === 'weapon_phase') {
    const mySideState = mySide ? state.sides[mySide] : null
    const totalPicks = mySideState?.picks.length ?? 0
    const filledWeapons = mySideState?.picks.filter((p) => !!p.weaponSlug).length ?? 0
    const canLock = !!mySideState && !mySideState.weaponsLocked && filledWeapons === totalPicks

    return (
      <section className="panel flex flex-col items-center justify-center gap-5 border-gold/40 p-6 text-center">
        <div className="rounded-full bg-gold/15 px-4 py-1 text-xs font-bold uppercase tracking-wider text-gold-strong">
          Pha chuẩn bị vũ khí
        </div>
        <h2 className="text-2xl font-extrabold text-text">Hoàn tất điền Vũ Khí cho đội hình</h2>
        <p className="max-w-md text-sm text-muted">
          Ban/Pick đã xong! Hãy bấm vào ô vũ khí ngay bên cạnh từng nhân vật trong cột của đội bạn để chọn vũ khí và tinh luyện (R1–R5).
        </p>

        {countdown !== null && (
          <div className="rounded-xl border border-gold/30 bg-bg/60 px-6 py-3">
            <div className="text-xs text-muted">Thời gian trống còn lại</div>
            <div className="font-mono text-3xl font-extrabold text-gold-strong">{countdown}s</div>
          </div>
        )}

        {mySideState ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm">
              Tiến độ của bạn:{' '}
              <strong className={filledWeapons === totalPicks ? 'text-success' : 'text-gold-strong'}>
                {filledWeapons} / {totalPicks} vũ khí
              </strong>
            </div>
            {mySideState.weaponsLocked ? (
              <div className="rounded-lg border border-success/40 bg-success/10 px-4 py-2 text-sm font-semibold text-success">
                Bạn đã khóa vũ khí! Đang chờ đối thủ hoàn tất…
              </div>
            ) : (
              <Button variant="primary" size="lg" disabled={!canLock} onClick={onLockWeapons}>
                Khóa Vũ Khí & Sang Tính Điểm
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Đang chờ hai người chơi hoàn tất chọn vũ khí…</p>
        )}
      </section>
    )
  }

  const selectedChar = selectedSlug ? getCharacter(selectedSlug) : null

  const isCharSelectable = (slug: string): boolean => {
    if (!currentStep || !isMyTurn) return false
    if (bannedSet.has(slug)) return false
    if (currentStep.action === 'ban') {
      return !allPickedSet.has(slug)
    }
    if (ownPickedSet.has(slug)) return false
    if (!state.ruleset.allowDuplicatePick && allPickedSet.has(slug)) return false
    return !!activeSideState?.ownedCharacters[slug]
  }

  const confirmAction = () => {
    if (!selectedSlug || !isCharSelectable(selectedSlug)) return
    onDraftAction(selectedSlug)
    setSelectedSlug(null)
  }

  return (
    <section className="panel flex flex-col gap-3 p-4">
      {currentStep && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3',
            currentStep.side === 'blue'
              ? 'border-hydro/50 bg-hydro/10'
              : 'border-danger/50 bg-danger/10',
          )}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">
              Lượt {currentStep.step} / {state.ruleset.draftSteps.length}
            </div>
            <div className="text-base font-extrabold">
              <span className={currentStep.side === 'blue' ? 'text-hydro' : 'text-danger'}>
                Đội {currentStep.side === 'blue' ? 'Xanh Dương' : 'Đỏ'}
              </span>{' '}
              đang <span className="text-gold-strong uppercase">{currentStep.action}</span>
              {isMyTurn ? ' (Lượt của bạn!)' : ''}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isMyTurn && currentStep.action === 'ban' && (
              <Button size="sm" variant="ghost" onClick={() => onDraftAction(null)}>
                Bỏ qua Ban
              </Button>
            )}
            {countdown !== null && (
              <div className="rounded-lg bg-black/40 px-3 py-1 font-mono text-xl font-extrabold text-gold-strong">
                {countdown}s
              </div>
            )}
          </div>
        </div>
      )}

      {/* Thanh xác nhận lựa chọn */}
      {isMyTurn && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
          <span>
            {selectedChar ? (
              <>
                Đang chọn: <strong className="text-gold-strong">{selectedChar.name}</strong>
              </>
            ) : (
              'Hãy chọn 1 nhân vật từ danh sách bên dưới…'
            )}
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={!selectedSlug || !isCharSelectable(selectedSlug)}
            onClick={confirmAction}
          >
            Xác nhận {currentStep?.action === 'ban' ? 'BAN' : 'PICK'}
          </Button>
        </div>
      )}

      {/* Bộ lọc nhân vật */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhân vật…"
            className="h-9 flex-1 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
          />
          <Chip active={rarity === 5} onClick={() => setRarity((r) => (r === 5 ? null : 5))}>
            5★
          </Chip>
          <Chip active={rarity === 4} onClick={() => setRarity((r) => (r === 4 ? null : 4))}>
            4★
          </Chip>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ELEMENTS.map((el) => (
            <Chip
              key={el}
              active={element === el}
              onClick={() => setElement((cur) => (cur === el ? null : el))}
              title={ELEMENT_LABEL[el]}
            >
              <ElementIcon element={el} className="size-3.5" />
              <span className="hidden sm:inline">{ELEMENT_LABEL[el]}</span>
            </Chip>
          ))}
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

      {/* Lưới nhân vật */}
      <div className="grid max-h-[34rem] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5 md:grid-cols-6">
        {filteredCharacters.map((c) => {
          const isBanned = bannedSet.has(c.slug)
          const isPicked = allPickedSet.has(c.slug)
          const ownedInActiveSide = activeSideState?.ownedCharacters[c.slug]
          const previewCost = ownedInActiveSide
            ? calcCharacterCost(c.slug, ownedInActiveSide.constellation, state.ruleset.costRules)
            : null
          const selectable = isCharSelectable(c.slug)
          const isSelected = selectedSlug === c.slug

          const disabledInPick =
            currentStep?.action === 'pick' &&
            (!ownedInActiveSide ||
              ownPickedSet.has(c.slug) ||
              (!state.ruleset.allowDuplicatePick && isPicked) ||
              isBanned)

          const disabledInBan = currentStep?.action === 'ban' && (isBanned || isPicked)
          const dimmed = disabledInPick || disabledInBan

          return (
            <button
              key={c.slug}
              type="button"
              disabled={!selectable}
              onClick={() => setSelectedSlug(c.slug)}
              title={`${c.name}${ownedInActiveSide ? ` (C${ownedInActiveSide.constellation} Lv${ownedInActiveSide.level})` : ' (Chưa sở hữu)'}`}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-lg border text-left transition',
                selectable ? 'cursor-pointer hover:-translate-y-0.5 hover:border-gold' : 'cursor-default',
                isSelected ? 'border-gold ring-2 ring-gold' : 'border-line/70',
                dimmed && 'opacity-30 grayscale',
              )}
            >
              <div
                className={cn(
                  'relative aspect-square w-full bg-gradient-to-br',
                  c.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
                )}
              >
                <img src={c.icon} alt={c.name} className="size-full object-cover" loading="lazy" />
                {c.element && <ElementIcon element={c.element} className="absolute top-1 left-1 size-3.5" />}

                {ownedInActiveSide && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[10px] leading-none font-bold text-gold-strong">
                    C{ownedInActiveSide.constellation}
                  </span>
                )}
                {previewCost !== null && (
                  <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 py-0.5 text-[10px] leading-none font-bold text-text">
                    {formatCost(previewCost)}
                  </span>
                )}
                {isBanned && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-extrabold text-danger">
                    BAN
                  </span>
                )}
                {isPicked && !isBanned && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-extrabold text-gold-strong">
                    PICK
                  </span>
                )}
              </div>
              <span className="truncate bg-panel-2 px-1 py-1 text-center text-[10px] font-medium text-text">
                {c.name}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
