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
import { CHARACTER_BY_SLUG, CHARACTERS } from '@/domain/characters'
import { calcCharacterCost, formatCost, getCharacterCustomCosts } from '@/domain/cost'
import type { DraftStep, MatchSide } from '@/domain/ruleset'
import {
  getOwnedTraveler,
  getTravelerElement,
  getTravelerElementSlug,
  isAnyTravelerSlug,
  isTravelerElementSlug,
  isTravelerGenderSlug,
  resolveCharacterForOwned,
  TRAVELER_ELEMENT_SLUGS,
} from '@/domain/traveler'
import { cn } from '@/lib/cn'
import type { MatchState, SideOwnedChar } from '@/services'
import { getLockedCharactersByUser } from './series'

export type RosterSortKey = 'cost' | 'name' | 'element'

interface Props {
  state: MatchState
  mode: 'interactive' | 'readonly'
  selectedSlug?: string | null
  onSelectCharacter?: (slug: string) => void
  onDoubleClickCharacter?: (slug: string) => void
  onRequestTravelerElement?: (side: MatchSide, autoSubmit: boolean) => void
}

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

interface SideRosterPanelProps {
  side: MatchSide
  state: MatchState
  mode: 'interactive' | 'readonly'
  currentStep: DraftStep | null
  bannedSet: Set<string>
  allPickedSet: Set<string>
  selectedSlug: string | null
  visibleMobile: boolean
  mobileBothMode: boolean
  onSelectCharacter?: (slug: string) => void
  onDoubleClickCharacter?: (slug: string) => void
  onRequestTravelerElement?: (side: MatchSide, autoSubmit: boolean) => void
}

const COMPACT_CHIP_CLS = 'h-7 px-2 text-[11px]'

function SideRosterPanel({
  side,
  state,
  mode,
  currentStep,
  bannedSet,
  allPickedSet,
  selectedSlug,
  visibleMobile,
  mobileBothMode,
  onSelectCharacter,
  onDoubleClickCharacter,
  onRequestTravelerElement,
}: SideRosterPanelProps) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<Element | null>(null)
  const [weapon, setWeapon] = useState<WeaponType | null>(null)
  const [rarity, setRarity] = useState<Rarity | null>(null)
  const [sortBy, setSortBy] = useState<RosterSortKey>('cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showWeaponFilters, setShowWeaponFilters] = useState(false)
  const [showUnownedForBan, setShowUnownedForBan] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const sideState = state.sides[side]
  const isBlue = side === 'blue'
  const sideLabel = isBlue ? 'Xanh' : 'Đỏ'
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

  const panelHighlighted =
    mode === 'interactive' && (isPickTurnForThisSide || isBanTargetForCurrentTurn)
  const isInactivePool = mode === 'interactive' && Boolean(currentStep) && !panelHighlighted

  const qNorm = normalizeText(query.trim())
  const hasActiveFilter = Boolean(qNorm || element || weapon || rarity)
  const extraFilterCount =
    (sortBy !== 'cost' ? 1 : 0) +
    (rarity ? 1 : 0) +
    (weapon ? 1 : 0) +
    (showUnownedForBan ? 1 : 0)

  const matchesFilter = (c: Character): boolean => {
    if (qNorm) {
      const nameMatch = normalizeText(c.name).includes(qNorm) || c.slug.includes(qNorm)
      const travelerAliasMatch =
        isAnyTravelerSlug(c.slug) &&
        ('nha lu hanh'.includes(qNorm) ||
          'traveler'.includes(qNorm) ||
          'main'.includes(qNorm) ||
          'aether'.includes(qNorm) ||
          'lumine'.includes(qNorm))
      if (!nameMatch && !travelerAliasMatch) return false
    }
    if (element && c.element !== element) return false
    if (weapon && c.weapon !== weapon) return false
    if (rarity && c.rarity !== rarity) return false
    return true
  }

  const handleSelectSort = (key: RosterSortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir(key === 'cost' ? 'desc' : 'asc')
    }
  }

  const sortRoster = (
    chars: readonly Character[],
    owned: Record<string, SideOwnedChar>,
  ): Character[] => {
    const dir = sortDir === 'asc' ? 1 : -1
    const elementIndex = (el: Element | null) => (el ? ELEMENTS.indexOf(el) : ELEMENTS.length)

    return [...chars].sort((a, b) => {
      const ownedA = isTravelerElementSlug(a.slug)
        ? getOwnedTraveler(owned)?.entry
        : owned[a.slug]
      const ownedB = isTravelerElementSlug(b.slug)
        ? getOwnedTraveler(owned)?.entry
        : owned[b.slug]
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

      const costA = ownedA
        ? calcCharacterCost(a.slug, ownedA.constellation, state.ruleset.costRules)
        : calcCharacterCost(a.slug, 0, state.ruleset.costRules)
      const costB = ownedB
        ? calcCharacterCost(b.slug, ownedB.constellation, state.ruleset.costRules)
        : calcCharacterCost(b.slug, 0, state.ruleset.costRules)
      if (costA !== costB) return dir * (costA - costB)
      if (b.rarity !== a.rarity) return b.rarity - a.rarity
      return a.name.localeCompare(b.name, 'vi')
    })
  }

  const ownedTraveler = getOwnedTraveler(ownedMap)
  const pickedTravelerSlot = sideState.picks.find((p) => isTravelerElementSlug(p.characterSlug))
  const sideHasPickedTraveler = Boolean(pickedTravelerSlot)

  const includeUnowned = isBanTargetForCurrentTurn && showUnownedForBan
  const rawCandidates: Character[] = CHARACTERS.filter((c) => {
    if (isTravelerGenderSlug(c.slug)) return false
    if (!matchesFilter(c)) return false
    return includeUnowned || Boolean(ownedMap[c.slug])
  })

  if (ownedTraveler || includeUnowned) {
    if (element !== null) {
      const elChar = resolveCharacterForOwned(getTravelerElementSlug(element), ownedMap)
      if (elChar && matchesFilter(elChar)) {
        rawCandidates.push(elChar)
      }
    } else {
      const baseSlug = ownedTraveler?.slug ?? 'traveler-boy'
      const baseChar = CHARACTER_BY_SLUG.get(baseSlug)
      if (baseChar && matchesFilter(baseChar)) {
        rawCandidates.push(ownedTraveler ? baseChar : { ...baseChar, name: 'Nhà Lữ Hành' })
      }
    }
  }

  const list = sortRoster(rawCandidates, ownedMap)

  return (
    <section
      data-side={side}
      data-pool-state={panelHighlighted ? 'active' : isInactivePool ? 'inactive' : 'readonly'}
      className={cn(
        'panel flex-col gap-2.5 p-2.5 transition sm:p-3',
        visibleMobile ? 'flex' : 'hidden md:flex',
        panelHighlighted
          ? isBlue
            ? 'border-hydro/80 bg-panel ring-2 ring-hydro/75 shadow-[0_0_24px_rgba(56,189,248,0.2)]'
            : 'border-danger/80 bg-panel ring-2 ring-danger/75 shadow-[0_0_24px_rgba(248,113,113,0.2)]'
          : isInactivePool
            ? 'border-line/40 bg-bg/40'
            : isBlue
              ? 'border-hydro/40'
              : 'border-danger/40',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2 transition-opacity',
          isInactivePool && 'opacity-75',
        )}
      >
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
          <span className="text-xs text-muted">({Object.keys(ownedMap).length} NV)</span>
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
        {isInactivePool && (
          <span className="rounded bg-panel-2/90 px-2 py-0.5 text-[11px] font-semibold text-muted">
            {isBanTurn ? 'Đang Ban kho đối thủ' : 'Chưa đến lượt'}
          </span>
        )}
      </div>

      {/* Thanh tìm kiếm, lọc và sắp xếp riêng của kho này */}
      <div
        className={cn(
          'flex flex-col gap-1.5 rounded-lg border border-line/50 bg-bg/55 p-2 transition-opacity',
          isInactivePool && 'opacity-75',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-36 flex-1">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted"
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
              placeholder={`Tìm nhân vật kho ${sideLabel}…`}
              aria-label={`Tìm nhân vật kho ${sideLabel}`}
              className="h-8 w-full rounded-lg border border-line bg-bg/75 pr-2.5 pl-8 text-sm text-text focus:border-gold focus:outline-none sm:text-xs"
            />
          </div>

          <Chip
            active={mobileFiltersOpen || extraFilterCount > 0}
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className={cn(COMPACT_CHIP_CLS, 'md:hidden')}
          >
            Lọc & Xếp{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}{' '}
            {mobileFiltersOpen ? '▴' : '▾'}
          </Chip>

          <div
            className={cn(
              'flex-wrap items-center gap-1',
              mobileFiltersOpen ? 'flex w-full md:w-auto' : 'hidden md:flex',
            )}
            role="group"
            aria-label={`Sắp xếp kho ${sideLabel}`}
          >
            {(
              [
                ['cost', 'Cost'],
                ['name', 'Tên'],
                ['element', 'Hệ'],
              ] as const
            ).map(([key, label]) => {
              const active = sortBy === key
              const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
              return (
                <Chip
                  key={key}
                  active={active}
                  onClick={() => handleSelectSort(key)}
                  className={COMPACT_CHIP_CLS}
                >
                  {label}
                  {arrow}
                </Chip>
              )
            })}
          </div>
        </div>

        <div
          className={cn(
            'flex-wrap items-center gap-1',
            mobileFiltersOpen ? 'flex' : 'hidden md:flex',
          )}
        >
          {([5, 4] as Rarity[]).map((r) => (
            <Chip
              key={r}
              active={rarity === r}
              onClick={() => setRarity((cur) => (cur === r ? null : r))}
              className={COMPACT_CHIP_CLS}
            >
              {r}★
            </Chip>
          ))}
          <Chip
            active={showWeaponFilters || Boolean(weapon)}
            onClick={() => setShowWeaponFilters((v) => !v)}
            className={COMPACT_CHIP_CLS}
          >
            Vũ khí
          </Chip>
          {mode === 'interactive' && isBanTargetForCurrentTurn && (
            <Chip
              active={showUnownedForBan}
              onClick={() => setShowUnownedForBan((v) => !v)}
              className={COMPACT_CHIP_CLS}
            >
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
              className="cursor-pointer px-1.5 text-[11px] font-semibold text-gold hover:underline"
            >
              Xóa lọc
            </button>
          )}
        </div>

        <div
          className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:px-0"
          role="group"
          aria-label={`Lọc theo hệ kho ${sideLabel}`}
        >
          <Chip
            active={element === null}
            onClick={() => setElement(null)}
            className={COMPACT_CHIP_CLS}
          >
            Tất cả
          </Chip>
          {ELEMENTS.map((el) => (
            <Chip
              key={el}
              active={element === el}
              onClick={() => setElement((cur) => (cur === el ? null : el))}
              className={COMPACT_CHIP_CLS}
            >
              <ElementIcon element={el} className="size-3" />
              {ELEMENT_LABEL[el]}
            </Chip>
          ))}
          {showWeaponFilters && (
            <>
              <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
              {WEAPONS.map((wt) => (
                <Chip
                  key={wt}
                  active={weapon === wt}
                  onClick={() => setWeapon((cur) => (cur === wt ? null : wt))}
                  className={COMPACT_CHIP_CLS}
                >
                  {WEAPON_LABEL[wt]}
                </Chip>
              ))}
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          'md:max-h-[34rem] md:overflow-y-auto md:pr-1',
          mobileBothMode && 'max-h-[24rem] overflow-y-auto pr-1',
        )}
      >
        <div className="grid grid-cols-4 items-start gap-1.5 min-[400px]:grid-cols-5 sm:grid-cols-6 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9 xl:gap-1.5 2xl:grid-cols-10">
          {list.map((c) => {
            const isGenericTravelerCard = isTravelerGenderSlug(c.slug)
            const isElementTravelerCard = isTravelerElementSlug(c.slug)
            const owned =
              isGenericTravelerCard || isElementTravelerCard
                ? ownedTraveler?.entry
                : ownedMap[c.slug]

            const hasAvailableBanElement = isGenericTravelerCard
              ? TRAVELER_ELEMENT_SLUGS.some(
                  (elSlug) => !bannedSet.has(elSlug) && !allPickedSet.has(elSlug),
                )
              : false
            const hasAvailablePickElement = isGenericTravelerCard
              ? !sideHasPickedTraveler &&
                TRAVELER_ELEMENT_SLUGS.some(
                  (elSlug) =>
                    !bannedSet.has(elSlug) &&
                    !lockedByPriorGame.has(elSlug) &&
                    (state.ruleset.allowDuplicatePick || !allPickedSet.has(elSlug)),
                )
              : false

            const isBanned = isGenericTravelerCard ? !hasAvailableBanElement : bannedSet.has(c.slug)
            const isPicked = isGenericTravelerCard ? false : allPickedSet.has(c.slug)
            const isOwnPicked = isGenericTravelerCard
              ? sideHasPickedTraveler
              : isElementTravelerCard
                ? sideHasPickedTraveler
                : ownPickedSet.has(c.slug)
            const lockedInGame = isGenericTravelerCard
              ? null
              : (lockedByPriorGame.get(c.slug) ?? null)
            const isPreviouslyPicked = lockedInGame !== null

            let selectable = false
            if (mode === 'interactive' && currentStep) {
              if (currentStep.action === 'ban') {
                selectable = isGenericTravelerCard
                  ? hasAvailableBanElement
                  : !isBanned && !isPicked
              } else if (currentStep.side === side) {
                selectable = isGenericTravelerCard
                  ? Boolean(owned) && hasAvailablePickElement
                  : Boolean(owned) &&
                    !isBanned &&
                    !isOwnPicked &&
                    !isPreviouslyPicked &&
                    (state.ruleset.allowDuplicatePick || !isPicked)
              }
            }

            const dimmed = isGenericTravelerCard
              ? !owned ||
                (isBanTurn && !hasAvailableBanElement) ||
                (mode === 'interactive' &&
                  currentStep?.action === 'pick' &&
                  currentStep.side === side &&
                  !selectable)
              : isBanned ||
                isPicked ||
                !owned ||
                (isOwnPicked && currentStep?.action === 'pick' && currentStep.side === side) ||
                (isPreviouslyPicked && currentStep?.action !== 'ban') ||
                (mode === 'interactive' &&
                  currentStep?.action === 'pick' &&
                  currentStep.side === side &&
                  !selectable)

            const isSelected =
              selectable &&
              !isInactivePool &&
              (isGenericTravelerCard
                ? isTravelerElementSlug(selectedSlug)
                : selectedSlug === c.slug)
            const selectedTravelerEl =
              isSelected && isGenericTravelerCard ? getTravelerElement(selectedSlug) : null

            const costPreview = isGenericTravelerCard
              ? selectedSlug && isTravelerElementSlug(selectedSlug) && owned
                ? calcCharacterCost(selectedSlug, owned.constellation, state.ruleset.costRules)
                : null
              : owned
                ? calcCharacterCost(c.slug, owned.constellation, state.ruleset.costRules)
                : null
            const customCosts = isGenericTravelerCard
              ? []
              : getCharacterCustomCosts(c.slug, state.ruleset.costRules)
            const customNoteSummary = customCosts.length
              ? ` · Có ${customCosts.length} ĐK Custom Cost (${customCosts.map((cc) => cc.note).join('; ')})`
              : ''
            const pickedTravelerEl =
              isGenericTravelerCard && pickedTravelerSlot
                ? getTravelerElement(pickedTravelerSlot.characterSlug)
                : null

            const handleCardClick = () => {
              if (!selectable) return
              if (isGenericTravelerCard && onRequestTravelerElement) {
                onRequestTravelerElement(side, false)
                return
              }
              onSelectCharacter?.(c.slug)
            }

            const handleCardDoubleClick = () => {
              if (!selectable) return
              if (isGenericTravelerCard && onRequestTravelerElement) {
                onRequestTravelerElement(side, true)
                return
              }
              onDoubleClickCharacter?.(c.slug)
            }

            return (
              <button
                key={`${side}-${c.slug}`}
                type="button"
                disabled={!selectable}
                onClick={handleCardClick}
                onDoubleClick={handleCardDoubleClick}
                title={`${c.name}${c.element ? ` · ${ELEMENT_LABEL[c.element]}` : ' · 7 hệ (bấm để chọn hệ)'}${
                  owned
                    ? ` · Lv${owned.level} · C${owned.constellation}${
                        costPreview !== null ? ` (+${formatCost(costPreview)} cost)` : ''
                      }`
                    : ' · Chưa sở hữu'
                }${customNoteSummary}${lockedInGame ? ` · Đã pick ở Ván ${lockedInGame} (không thể pick lại)` : ''}`}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded border text-left transition',
                  selectable
                    ? !isInactivePool
                      ? 'cursor-pointer hover:-translate-y-0.5 hover:border-gold-strong'
                      : 'cursor-pointer'
                    : 'cursor-default',
                  isSelected
                    ? 'z-10 scale-[1.03] border-gold-strong ring-2 ring-gold-strong'
                    : 'border-line/70',
                  dimmed
                    ? isInactivePool
                      ? 'opacity-25 grayscale brightness-75'
                      : 'opacity-35 grayscale'
                    : isInactivePool && 'opacity-35 grayscale brightness-75',
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
                  {(c.element ?? selectedTravelerEl) && (
                    <ElementIcon
                      element={(c.element ?? selectedTravelerEl)!}
                      className="absolute top-0.5 left-0.5 size-3.5"
                    />
                  )}
                  {isGenericTravelerCard && !selectedTravelerEl && (
                    <span className="absolute top-0.5 left-0.5 rounded bg-black/75 px-1 py-0.2 text-[8px] font-bold text-gold-strong">
                      7 hệ
                    </span>
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
                  {((isPicked && !isBanned) || (isGenericTravelerCard && sideHasPickedTraveler)) && (
                    <span className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/55 text-[10px] font-black text-gold-strong">
                      {pickedTravelerEl && (
                        <ElementIcon element={pickedTravelerEl} className="size-3.5" />
                      )}
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

export function DualRosterGrid({
  state,
  mode,
  selectedSlug = null,
  onSelectCharacter,
  onDoubleClickCharacter,
  onRequestTravelerElement,
}: Props) {
  const [tabOverride, setTabOverride] = useState<{
    key: string
    tab: 'blue' | 'red' | 'both'
  } | null>(null)

  const currentStep =
    mode === 'interactive' && state.status === 'drafting'
      ? state.ruleset.draftSteps[state.currentStepIndex] ?? null
      : null

  const stepKey = `${state.currentGame ?? 1}-${state.status}-${state.currentStepIndex}`
  const targetSide: MatchSide | null = currentStep
    ? currentStep.action === 'pick'
      ? currentStep.side
      : currentStep.side === 'blue'
        ? 'red'
        : 'blue'
    : null
  const mobileTab: 'blue' | 'red' | 'both' =
    tabOverride?.key === stepKey ? tabOverride.tab : (targetSide ?? 'blue')

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

  const blueOwnedCount = Object.keys(state.sides.blue.ownedCharacters).length
  const redOwnedCount = Object.keys(state.sides.red.ownedCharacters).length

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      {/* Bộ chuyển nhanh giữa 2 kho trên Mobile (< md) */}
      <div
        role="tablist"
        aria-label="Chọn kho hiển thị"
        className="grid min-h-11 grid-cols-3 gap-1 rounded-xl border border-line/65 bg-bg p-1 md:hidden"
      >
        {(
          [
            ['blue', `Kho Xanh (${blueOwnedCount})`],
            ['red', `Kho Đỏ (${redOwnedCount})`],
            ['both', 'Cả 2 kho'],
          ] as const
        ).map(([tab, label]) => {
          const active = mobileTab === tab
          const isTarget = targetSide === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTabOverride({ key: stepKey, tab })}
              className={cn(
                'flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors',
                active
                  ? tab === 'blue'
                    ? 'bg-panel-2 font-semibold text-hydro ring-1 ring-hydro/40'
                    : tab === 'red'
                      ? 'bg-panel-2 font-semibold text-danger ring-1 ring-danger/40'
                      : 'bg-panel-2 font-semibold text-gold-strong ring-1 ring-gold/40'
                  : 'text-muted hover:text-text',
              )}
            >
              {isTarget && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    tab === 'blue' ? 'bg-hydro' : 'bg-danger',
                  )}
                />
              )}
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
        {(['blue', 'red'] as const).map((side) => (
          <SideRosterPanel
            key={side}
            side={side}
            state={state}
            mode={mode}
            currentStep={currentStep}
            bannedSet={bannedSet}
            allPickedSet={allPickedSet}
            selectedSlug={selectedSlug}
            visibleMobile={mobileTab === 'both' || mobileTab === side}
            mobileBothMode={mobileTab === 'both'}
            onSelectCharacter={onSelectCharacter}
            onDoubleClickCharacter={onDoubleClickCharacter}
            onRequestTravelerElement={onRequestTravelerElement}
          />
        ))}
      </div>
    </div>
  )
}
