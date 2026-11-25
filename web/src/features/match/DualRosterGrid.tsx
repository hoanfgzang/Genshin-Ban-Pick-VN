import { useMemo, useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { ElementIcon } from '@/components/ui/ElementIcon'
import {
  ELEMENT_LABEL,
  ELEMENTS,
  WEAPON_LABEL,
  WEAPONS,
  type Character,
  type Element,
  type Rarity,
  type WeaponType,
} from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import { calcCharacterCost, formatCost, getCharacterCustomCosts } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState, SideOwnedChar } from '@/services'
import { getLockedCharactersByUser } from './series'

export type RosterSortKey = 'default' | 'name' | 'element' | 'cost'

interface Props {
  state: MatchState
  mode: 'interactive' | 'readonly'
  selectedSlug?: string | null
  onSelectCharacter?: (slug: string) => void
  onDoubleClickCharacter?: (slug: string) => void
}

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

export function DualRosterGrid({
  state,
  mode,
  selectedSlug = null,
  onSelectCharacter,
  onDoubleClickCharacter,
}: Props) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<Element | null>(null)
  const [weapon, setWeapon] = useState<WeaponType | null>(null)
  const [rarity, setRarity] = useState<Rarity | null>(null)
  const [sortBy, setSortBy] = useState<RosterSortKey>('default')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showWeaponFilters, setShowWeaponFilters] = useState(false)
  const [showUnownedForBan, setShowUnownedForBan] = useState(false)

  const currentStep =
    mode === 'interactive' && state.status === 'drafting'
      ? state.ruleset.draftSteps[state.currentStepIndex] ?? null
      : null

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

  const qNorm = normalizeText(query.trim())
  const hasActiveFilter = Boolean(qNorm || element || weapon || rarity)

  const matchesFilter = (c: Character): boolean => {
    if (qNorm && !normalizeText(c.name).includes(qNorm) && !c.slug.includes(qNorm)) return false
    if (element && c.element !== element) return false
    if (weapon && c.weapon !== weapon) return false
    if (rarity && c.rarity !== rarity) return false
    return true
  }

  const handleSelectSort = (key: RosterSortKey) => {
    if (key === 'default') {
      setSortBy('default')
      return
    }
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir(key === 'cost' ? 'desc' : 'asc')
    }
  }

  const sortRoster = (
    chars: readonly Character[],
    ownedMap: Record<string, SideOwnedChar>,
  ): Character[] => {
    const dir = sortDir === 'asc' ? 1 : -1
    const elementIndex = (el: Element | null) => (el ? ELEMENTS.indexOf(el) : ELEMENTS.length)

    return [...chars].sort((a, b) => {
      const ownedA = ownedMap[a.slug]
      const ownedB = ownedMap[b.slug]
      const ownedDiff = Number(Boolean(ownedB)) - Number(Boolean(ownedA))
      if (ownedDiff !== 0) return ownedDiff

      if (sortBy === 'name') {
        return dir * a.name.localeCompare(b.name, 'vi')
      }

      if (sortBy === 'element') {
        const elDiff = elementIndex(a.element) - elementIndex(b.element)
        if (elDiff !== 0) return dir * elDiff
        return a.name.localeCompare(b.name, 'vi')
      }

      if (sortBy === 'cost') {
        const costA = ownedA
          ? calcCharacterCost(a.slug, ownedA.constellation, state.ruleset.costRules)
          : calcCharacterCost(a.slug, 0, state.ruleset.costRules)
        const costB = ownedB
          ? calcCharacterCost(b.slug, ownedB.constellation, state.ruleset.costRules)
          : calcCharacterCost(b.slug, 0, state.ruleset.costRules)
        if (costA !== costB) return dir * (costA - costB)
        if (b.rarity !== a.rarity) return b.rarity - a.rarity
        return a.name.localeCompare(b.name, 'vi')
      }

      if (b.rarity !== a.rarity) return b.rarity - a.rarity
      const cDiff = (ownedB?.constellation ?? -1) - (ownedA?.constellation ?? -1)
      if (cDiff !== 0) return cDiff
      const lvDiff = (ownedB?.level ?? 0) - (ownedA?.level ?? 0)
      if (lvDiff !== 0) return lvDiff
      return (b.release ?? '').localeCompare(a.release ?? '')
    })
  }

  const renderSideRoster = (side: MatchSide) => {
    const sideState = state.sides[side]
    const isBlue = side === 'blue'
    const ownedMap = sideState.ownedCharacters
    const ownPickedSet = new Set(sideState.picks.map((p) => p.characterSlug))
    const lockedByPriorGame = getLockedCharactersByUser(
      state.gameHistory,
      sideState.player?.userId,
      state.currentGame,
    )

    const isBanTurn = currentStep?.action === 'ban'
    const isPickTurnForThisSide = currentStep?.action === 'pick' && currentStep.side === side
    const isBanTargetForCurrentTurn = isBanTurn && currentStep.side !== side

    const includeUnowned = isBanTargetForCurrentTurn && showUnownedForBan
    const list = sortRoster(
      CHARACTERS.filter((c) => {
        if (!matchesFilter(c)) return false
        return includeUnowned || Boolean(ownedMap[c.slug])
      }),
      ownedMap,
    )

    const panelHighlighted =
      mode === 'interactive' && (isPickTurnForThisSide || isBanTargetForCurrentTurn)

    return (
      <section
        className={cn(
          'panel flex flex-col gap-2.5 p-3 transition',
          isBlue ? 'border-hydro/40' : 'border-danger/40',
          panelHighlighted &&
            (isBanTargetForCurrentTurn
              ? 'ring-2 ring-danger/70'
              : isBlue
                ? 'ring-2 ring-hydro/70'
                : 'ring-2 ring-danger/70'),
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
            <h3 className="text-sm font-bold text-text">
              Kho {sideState.player?.displayName ?? 'Trống'}
            </h3>
            <span className="text-xs text-muted">
              ({Object.keys(ownedMap).length} NV)
            </span>
          </div>

          {mode === 'interactive' && isPickTurnForThisSide && (
            <span className="rounded bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold-strong">
              Chọn Pick từ kho này
            </span>
          )}
          {mode === 'interactive' && isBanTargetForCurrentTurn && (
            <span className="rounded bg-danger/20 px-2 py-0.5 text-[11px] font-bold text-danger">
              Kho đối thủ — nhắm Ban
            </span>
          )}
        </div>

        <div className="max-h-[34rem] overflow-y-auto pr-1">
          <div className="grid grid-cols-5 items-start gap-1.5 sm:grid-cols-7 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10">
            {list.map((c) => {
              const owned = ownedMap[c.slug]
              const isBanned = bannedSet.has(c.slug)
              const isPicked = allPickedSet.has(c.slug)
              const isOwnPicked = ownPickedSet.has(c.slug)
              const lockedInGame = lockedByPriorGame.get(c.slug) ?? null
              const isPreviouslyPicked = lockedInGame !== null

              let selectable = false
              if (mode === 'interactive' && currentStep && onSelectCharacter) {
                if (currentStep.action === 'ban') {
                  selectable = !isBanned && !isPicked
                } else if (currentStep.side === side) {
                  selectable =
                    Boolean(owned) &&
                    !isBanned &&
                    !isOwnPicked &&
                    !isPreviouslyPicked &&
                    (state.ruleset.allowDuplicatePick || !isPicked)
                }
              }

              const dimmed =
                isBanned ||
                isPicked ||
                !owned ||
                (isPreviouslyPicked && currentStep?.action !== 'ban') ||
                (mode === 'interactive' &&
                  currentStep?.action === 'pick' &&
                  currentStep.side === side &&
                  !selectable)

              const isSelected = selectable && selectedSlug === c.slug
              const costPreview = owned
                ? calcCharacterCost(c.slug, owned.constellation, state.ruleset.costRules)
                : null
              const customCosts = getCharacterCustomCosts(c.slug, state.ruleset.costRules)
              const customNoteSummary = customCosts.length
                ? ` · Có ${customCosts.length} ĐK Custom Cost (${customCosts.map((cc) => cc.note).join('; ')})`
                : ''

              return (
                <button
                  key={`${side}-${c.slug}`}
                  type="button"
                  disabled={!selectable}
                  onClick={() => selectable && onSelectCharacter?.(c.slug)}
                  onDoubleClick={() => selectable && onDoubleClickCharacter?.(c.slug)}
                  title={`${c.name}${c.element ? ` · ${ELEMENT_LABEL[c.element]}` : ''}${
                    owned
                      ? ` · Lv${owned.level} · C${owned.constellation} (+${formatCost(costPreview ?? 0)} cost)`
                      : ' · Chưa sở hữu'
                  }${customNoteSummary}${lockedInGame ? ` · Đã pick ở Ván ${lockedInGame} (không thể pick lại)` : ''}`}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded border text-left transition',
                    selectable
                      ? 'cursor-pointer hover:-translate-y-0.5 hover:border-gold-strong'
                      : 'cursor-default',
                    isSelected
                      ? 'z-10 scale-[1.03] border-gold-strong ring-2 ring-gold-strong'
                      : 'border-line/70',
                    dimmed && 'opacity-35 grayscale',
                  )}
                >
                  <div
                    className={cn(
                      'relative aspect-square w-full shrink-0 bg-gradient-to-br',
                      c.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
                    )}
                  >
                    <img
                      src={c.icon}
                      alt={c.name}
                      width={96}
                      height={96}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {c.element && (
                      <ElementIcon element={c.element} className="absolute top-0.5 left-0.5 size-3.5" />
                    )}
                    {costPreview !== null && costPreview > 0 && (
                      <span className="absolute top-0.5 right-0.5 rounded bg-black/80 px-1 py-0.2 font-mono text-[9px] font-bold text-gold-strong">
                        {formatCost(costPreview)}
                      </span>
                    )}
                    {customCosts.length > 0 && (
                      <span
                        className={cn(
                          'absolute right-0.5 rounded bg-hydro/90 px-1 py-0.2 text-[8px] font-black text-bg',
                          costPreview !== null && costPreview > 0 ? 'top-4' : 'top-0.5',
                        )}
                      >
                        ĐK
                      </span>
                    )}
                    {owned && (
                      <>
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 py-0.2 font-mono text-[9px] font-bold leading-none text-gold-strong">
                          C{owned.constellation}
                        </span>
                        <span className="absolute right-0.5 bottom-0.5 rounded bg-black/75 px-1 py-0.2 font-mono text-[9px] font-bold leading-none text-white">
                          {owned.level}
                        </span>
                      </>
                    )}
                    {isBanned && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-black text-danger">
                        BAN
                      </span>
                    )}
                    {isPicked && !isBanned && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-black text-gold-strong">
                        PICK
                      </span>
                    )}
                    {isPreviouslyPicked && !isBanned && !isPicked && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-black text-gold">
                        VÁN {lockedInGame}
                      </span>
                    )}
                  </div>

                  <span className="block w-full shrink-0 truncate bg-white px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-black">
                    {c.name}
                  </span>
                </button>
              )
            })}
            {list.length === 0 && (
              <div className="col-span-full py-10 text-center text-xs text-muted">
                Không có nhân vật khớp bộ lọc.
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Thanh tìm kiếm, lọc hệ và sắp xếp luôn hiển thị trên bể chứa nhân vật */}
      <div className="panel flex flex-col gap-2.5 border-line/70 bg-bg/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên nhân vật ở cả 2 kho…"
              aria-label="Tìm nhân vật"
              className="h-9 w-full rounded-lg border border-line bg-bg/75 pr-3 pl-8 text-sm text-text focus:border-gold focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Sắp xếp nhân vật">
            <span className="mr-0.5 text-xs font-medium text-muted">Sắp xếp:</span>
            {(
              [
                ['default', 'Mặc định'],
                ['name', 'Tên'],
                ['element', 'Hệ'],
                ['cost', 'Cost'],
              ] as const
            ).map(([key, label]) => {
              const active = sortBy === key
              const arrow = active && key !== 'default' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
              return (
                <Chip key={key} active={active} onClick={() => handleSelectSort(key)}>
                  {label}
                  {arrow}
                </Chip>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {([5, 4] as Rarity[]).map((r) => (
              <Chip key={r} active={rarity === r} onClick={() => setRarity((cur) => (cur === r ? null : r))}>
                {r}★
              </Chip>
            ))}
            <Chip active={showWeaponFilters || Boolean(weapon)} onClick={() => setShowWeaponFilters((v) => !v)}>
              Vũ khí
            </Chip>
            {mode === 'interactive' && currentStep?.action === 'ban' && (
              <Chip active={showUnownedForBan} onClick={() => setShowUnownedForBan((v) => !v)}>
                NV ngoài kho
              </Chip>
            )}
            {hasActiveFilter && (
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
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo hệ">
          <Chip active={element === null} onClick={() => setElement(null)}>
            Tất cả hệ
          </Chip>
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
          {showWeaponFilters && (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderSideRoster('blue')}
        {renderSideRoster('red')}
      </div>
    </div>
  )
}
