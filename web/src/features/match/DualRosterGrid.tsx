import { useMemo } from 'react'
import { ElementIcon } from '@/components/ui/ElementIcon'
import {
  ELEMENT_LABEL,
  type Character,
  type Element,
  type Rarity,
  type WeaponType,
} from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import { calcCharacterCost, formatCost } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState, SideOwnedChar } from '@/services'

interface Props {
  state: MatchState
  mode: 'interactive' | 'readonly'
  selectedSlug?: string | null
  query?: string
  element?: Element | null
  weapon?: WeaponType | null
  rarity?: Rarity | null
  showUnownedForBan?: boolean
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
  query = '',
  element = null,
  weapon = null,
  rarity = null,
  showUnownedForBan = false,
  onSelectCharacter,
  onDoubleClickCharacter,
}: Props) {
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

  const matchesFilter = (c: Character): boolean => {
    if (qNorm && !normalizeText(c.name).includes(qNorm) && !c.slug.includes(qNorm)) return false
    if (element && c.element !== element) return false
    if (weapon && c.weapon !== weapon) return false
    if (rarity && c.rarity !== rarity) return false
    return true
  }

  const sortRoster = (
    chars: readonly Character[],
    ownedMap: Record<string, SideOwnedChar>,
  ): Character[] => {
    return [...chars].sort((a, b) => {
      const ownedDiff = Number(Boolean(ownedMap[b.slug])) - Number(Boolean(ownedMap[a.slug]))
      if (ownedDiff !== 0) return ownedDiff
      if (b.rarity !== a.rarity) return b.rarity - a.rarity
      const cDiff = (ownedMap[b.slug]?.constellation ?? -1) - (ownedMap[a.slug]?.constellation ?? -1)
      if (cDiff !== 0) return cDiff
      const lvDiff = (ownedMap[b.slug]?.level ?? 0) - (ownedMap[a.slug]?.level ?? 0)
      if (lvDiff !== 0) return lvDiff
      return (b.release ?? '').localeCompare(a.release ?? '')
    })
  }

  const renderSideRoster = (side: MatchSide) => {
    const sideState = state.sides[side]
    const isBlue = side === 'blue'
    const ownedMap = sideState.ownedCharacters
    const ownPickedSet = new Set(sideState.picks.map((p) => p.characterSlug))

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

            let selectable = false
            if (mode === 'interactive' && currentStep && onSelectCharacter) {
              if (currentStep.action === 'ban') {
                selectable = !isBanned && !isPicked
              } else if (currentStep.side === side) {
                selectable =
                  Boolean(owned) &&
                  !isBanned &&
                  !isOwnPicked &&
                  (state.ruleset.allowDuplicatePick || !isPicked)
              }
            }

            const dimmed =
              isBanned ||
              isPicked ||
              !owned ||
              (mode === 'interactive' &&
                currentStep?.action === 'pick' &&
                currentStep.side === side &&
                !selectable)

            const isSelected = selectable && selectedSlug === c.slug
            const costPreview = owned
              ? calcCharacterCost(c.slug, owned.constellation, state.ruleset.costRules)
              : null

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
                }`}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded border text-left transition',
                  selectable
                    ? 'cursor-pointer hover:-translate-y-0.5 hover:border-gold-strong'
                    : 'cursor-default',
                  isSelected
                    ? 'border-gold-strong ring-2 ring-gold-strong scale-[1.03] z-10'
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
                    <span className="absolute right-0.5 bottom-0.5 rounded bg-black/75 px-1 py-0.2 text-[9px] font-bold text-gold-strong">
                      {formatCost(costPreview)}
                    </span>
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
                </div>

                <span
                  className={cn(
                    'block w-full shrink-0 px-0.5 py-0.5 text-center font-mono text-[10px] font-bold leading-tight whitespace-nowrap',
                    owned ? 'bg-panel-2 text-text' : 'bg-bg/80 text-muted',
                  )}
                >
                  {owned ? `${owned.level} | C${owned.constellation}` : '—'}
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {renderSideRoster('blue')}
      {renderSideRoster('red')}
    </div>
  )
}
