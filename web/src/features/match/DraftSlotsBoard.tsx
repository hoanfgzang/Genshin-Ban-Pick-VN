import { useMemo, useState } from 'react'
import { ElementIcon } from '@/components/ui/ElementIcon'
import {
  calcCharacterCost,
  formatCost,
  formatCostMilestoneSummary,
  formatSeconds,
  round2,
} from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import {
  getOwnedTraveler,
  isTravelerElementSlug,
  resolveCharacterForOwned,
} from '@/domain/traveler'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import {
  buildDraftBoardRows,
  computeCostBreakdown,
  getDraftHighlightSets,
  type DraftBoardCell,
} from './lineup'

function chunkMaxFour(row: DraftBoardCell[]): DraftBoardCell[][] {
  if (row.length <= 4) return [row]
  const chunks: DraftBoardCell[][] = []
  for (let i = 0; i < row.length; i += 4) {
    chunks.push(row.slice(i, i + 4))
  }
  return chunks
}

interface Props {
  state: MatchState
  countdown?: number | null
  hoverCharacterSlug?: string | null
  canEditWeaponsForSide: (side: MatchSide) => boolean
  onSelectPickSlot?: (side: MatchSide, pick: MatchPickSlot) => void
}

export function DraftSlotsBoard({
  state,
  countdown = null,
  hoverCharacterSlug = null,
  canEditWeaponsForSide,
  onSelectPickSlot,
}: Props) {
  const [showFullBoardMobile, setShowFullBoardMobile] = useState(false)
  const [showMobileStats, setShowMobileStats] = useState(false)
  const isPostDraft = state.status !== 'drafting'
  const activeStep =
    state.status === 'drafting' ? state.ruleset.draftSteps[state.currentStepIndex] ?? null : null
  const useReserveTime = Boolean(state.ruleset.useReserveTime)
  const reserveDefault = state.ruleset.reserveTimeSeconds ?? 120
  const maxOvertimeSeconds = state.ruleset.maxOvertimeSeconds ?? 600

  const calcSideOvertime = (side: MatchSide): number => {
    const sideState = state.sides[side]
    const savedOvertime = sideState.overtimePenaltySeconds ?? 0
    if (
      countdown !== null &&
      countdown < 0 &&
      state.status === 'drafting' &&
      activeStep?.side === side
    ) {
      const elapsedOver = -countdown
      const savedReserve = sideState.reserveRemainingSeconds ?? reserveDefault
      const rawOver = useReserveTime ? Math.max(0, elapsedOver - savedReserve) : elapsedOver
      const liveOver =
        maxOvertimeSeconds > 0
          ? Math.min(rawOver, Math.max(0, maxOvertimeSeconds - savedOvertime))
          : rawOver
      return round2(savedOvertime + liveOver)
    }
    return round2(savedOvertime)
  }

  const renderSideStats = (side: MatchSide) => {
    const isBlue = side === 'blue'
    const sideState = state.sides[side]
    const breakdown = computeCostBreakdown(sideState.picks)
    const milestone = formatCostMilestoneSummary(sideState.totalCost, state.ruleset.costRules)
    const refSec = sideState.weaponRefinementSeconds ?? breakdown.weaponRefinementSeconds
    const addedSeconds = round2(sideState.costPenaltySeconds + refSec)
    const overtimeSeconds = calcSideOvertime(side)
    const totalAdded = round2(addedSeconds + overtimeSeconds)

    return (
      <div
        data-side-stats={side}
        aria-label={`Thông tin Cost và Thời gian đội ${isBlue ? 'Xanh' : 'Đỏ'}`}
        className={cn(
          !showMobileStats && 'hidden md:block',
          'order-2 w-full rounded-lg border bg-bg/60 p-2.5 text-xs md:mt-auto md:max-xl:rounded-none md:max-xl:border-x-0 md:max-xl:border-b-0 md:max-xl:border-t md:max-xl:border-line/50 md:max-xl:bg-transparent md:max-xl:p-0 md:max-xl:pt-2 xl:mt-0 xl:flex-1 xl:min-w-[176px] xl:max-w-[224px] xl:rounded-xl xl:border xl:bg-bg/80 xl:p-3 2xl:max-w-[252px] 2xl:p-3.5 2xl:text-[13px]',
          isBlue
            ? 'border-hydro/35 xl:order-1 xl:border-hydro/35 xl:mr-auto'
            : 'border-danger/35 xl:order-2 xl:border-danger/35 xl:ml-auto',
        )}
      >
        <div className="mb-1.5 flex items-center justify-between gap-1.5 border-b border-line/60 pb-1 sm:mb-2 sm:gap-2 sm:pb-1.5 md:hidden xl:flex">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase',
                isBlue ? 'bg-hydro/15 text-hydro' : 'bg-danger/15 text-danger',
              )}
            >
              {isBlue ? 'Xanh' : 'Đỏ'}
            </span>
            <span className="truncate text-xs font-bold text-text 2xl:text-sm">
              {sideState.player?.displayName ?? 'Trống'}
            </span>
          </div>
          <span className="shrink-0 font-mono text-xs font-extrabold text-gold-strong 2xl:text-sm">
            +{formatSeconds(totalAdded)}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 xl:grid-cols-1 xl:gap-y-2">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Cost</dt>
              <dd className="font-mono text-xs font-extrabold text-gold-strong sm:text-sm 2xl:text-[15px]">
                {formatCost(sideState.totalCost)}
              </dd>
            </div>
            <div className="truncate text-[11px] text-muted">
              NV {formatCost(breakdown.characterCost)} · VK {formatCost(breakdown.weaponCost)}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-muted">
                <span className="xl:hidden">Mốc</span>
                <span className="hidden xl:inline">Mốc cost</span>
              </dt>
              <dd className="truncate font-mono text-xs font-bold text-text sm:text-sm 2xl:text-[15px]">
                {milestone.rangeLabel}
              </dd>
            </div>
            <div className="truncate text-[11px] text-muted">{milestone.rateLabel}</div>
          </div>

          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-muted">
                <span className="xl:hidden">Cộng</span>
                <span className="hidden xl:inline">Thời gian cộng thêm</span>
              </dt>
              <dd className="font-mono text-xs font-extrabold text-gold-strong sm:text-sm 2xl:text-[15px]">
                +{formatSeconds(addedSeconds)}
              </dd>
            </div>
            {refSec > 0 && (
              <div className="truncate text-[11px] text-muted">
                Cost +{formatSeconds(sideState.costPenaltySeconds)} · TL +{formatSeconds(refSec)}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-muted">
              <span className="xl:hidden">Phạt</span>
              <span className="hidden xl:inline">Thời gian bị phạt</span>
            </dt>
            <dd
              className={cn(
                'font-mono text-xs font-extrabold sm:text-sm 2xl:text-[15px]',
                overtimeSeconds > 0 ? 'text-danger' : 'text-text',
              )}
            >
              {overtimeSeconds > 0 ? `+${formatSeconds(overtimeSeconds)}` : '0s'}
            </dd>
          </div>
        </dl>
      </div>
    )
  }

  const board = useMemo(
    () =>
      buildDraftBoardRows(
        state.ruleset.draftSteps,
        state.sides,
        state.currentStepIndex,
        state.status,
      ),
    [state.ruleset.draftSteps, state.sides, state.currentStepIndex, state.status],
  )

  const { maxPickCols, maxBanCols } = useMemo(() => {
    const pickLens = [
      ...board.blue.pickRows.flatMap(chunkMaxFour).map((r) => r.length),
      ...board.red.pickRows.flatMap(chunkMaxFour).map((r) => r.length),
    ]
    const banLens = [
      ...board.blue.banRows.flatMap(chunkMaxFour).map((r) => r.length),
      ...board.red.banRows.flatMap(chunkMaxFour).map((r) => r.length),
    ]
    return {
      maxPickCols: Math.max(1, ...pickLens),
      maxBanCols: Math.max(1, ...banLens),
    }
  }, [board])

  const pickSlotSizeCls =
    maxBanCols >= 3
      ? '[--slot-w:2.75rem] md:[--slot-w:2.75rem] lg:[--slot-w:3.5rem] xl:[--slot-w:3.25rem] 2xl:[--slot-w:4rem] min-[1680px]:[--slot-w:4.75rem]'
      : maxPickCols <= 3
        ? '[--slot-w:3rem] md:[--slot-w:3.75rem] lg:[--slot-w:4.75rem] xl:[--slot-w:4.5rem] 2xl:[--slot-w:5.5rem] min-[1680px]:[--slot-w:6.25rem]'
        : '[--slot-w:2.75rem] md:[--slot-w:3rem] lg:[--slot-w:4.25rem] xl:[--slot-w:3.75rem] 2xl:[--slot-w:4.75rem] min-[1680px]:[--slot-w:5.5rem]'

  const banSlotSizeCls =
    maxBanCols >= 3
      ? 'md:[--slot-w:2.25rem] lg:[--slot-w:2.875rem] xl:[--slot-w:2.75rem] 2xl:[--slot-w:3.375rem] min-[1680px]:[--slot-w:3.875rem]'
      : maxPickCols <= 3
        ? 'md:[--slot-w:3.125rem] lg:[--slot-w:4rem] xl:[--slot-w:3.625rem] 2xl:[--slot-w:4.5rem] min-[1680px]:[--slot-w:5rem]'
        : 'md:[--slot-w:2.625rem] lg:[--slot-w:3.5rem] xl:[--slot-w:3.25rem] 2xl:[--slot-w:4rem] min-[1680px]:[--slot-w:4.625rem]'

  const highlights = useMemo(
    () =>
      getDraftHighlightSets(
        state.ruleset.draftSteps,
        state.currentStepIndex,
        state.status,
      ),
    [state.ruleset.draftSteps, state.currentStepIndex, state.status],
  )

  const lookupBanConstellation = (side: MatchSide, slug: string | null): number | null => {
    if (!slug) return null
    const opponent: MatchSide = side === 'blue' ? 'red' : 'blue'
    if (isTravelerElementSlug(slug)) {
      return (
        getOwnedTraveler(state.sides[opponent].ownedCharacters)?.entry.constellation ??
        getOwnedTraveler(state.sides[side].ownedCharacters)?.entry.constellation ??
        null
      )
    }
    return (
      state.sides[opponent].ownedCharacters[slug]?.constellation ??
      state.sides[side].ownedCharacters[slug]?.constellation ??
      null
    )
  }

  const renderCell = (
    cell: DraftBoardCell,
    positionInGroup: 'single' | 'first' | 'middle' | 'last',
    fluidMobile = false,
  ) => {
    const isActive = cell.status === 'active'
    const isInActiveGroup = highlights.activeGroupSteps.has(cell.step)
    const isNextUp = !isInActiveGroup && highlights.nextGroupSteps.has(cell.step)
    const displaySlug =
      cell.status === 'done'
        ? cell.characterSlug
        : isActive
          ? hoverCharacterSlug
          : null
    const isBlue = cell.side === 'blue'
    const isBan = cell.action === 'ban'
    const opponentSide: MatchSide = cell.side === 'blue' ? 'red' : 'blue'
    const char = displaySlug
      ? isBan
        ? resolveCharacterForOwned(
            displaySlug,
            state.sides[opponentSide].ownedCharacters,
            state.sides[cell.side].ownedCharacters,
          ) ?? null
        : resolveCharacterForOwned(displaySlug, state.sides[cell.side].ownedCharacters) ?? null
      : null
    const canClickPick =
      cell.status === 'done' &&
      cell.action === 'pick' &&
      !!cell.pickSlot &&
      canEditWeaponsForSide(cell.side) &&
      !!onSelectPickSlot

    const constellation = (() => {
      if (!displaySlug) return null
      if (isBan) return lookupBanConstellation(cell.side, displaySlug)
      if (cell.status === 'done') return cell.constellation
      if (isTravelerElementSlug(displaySlug)) {
        return getOwnedTraveler(state.sides[cell.side].ownedCharacters)?.entry.constellation ?? null
      }
      return state.sides[cell.side].ownedCharacters[displaySlug]?.constellation ?? null
    })()

    const pickInfo = (() => {
      if (isBan || !displaySlug || !char) return null
      if (cell.status === 'done' && cell.pickSlot) {
        const p = cell.pickSlot
        return {
          level: p.level,
          characterCost: p.characterCost,
          weaponCost: p.weaponCost,
          totalCost: round2(p.characterCost + p.weaponCost),
          extraSeconds: p.weaponRefinementSeconds ?? 0,
          weapon: p.weaponSlug ? (getWeapon(p.weaponSlug) ?? null) : null,
          refinement: p.refinement,
        }
      }
      const owned = isTravelerElementSlug(displaySlug)
        ? getOwnedTraveler(state.sides[cell.side].ownedCharacters)?.entry
        : state.sides[cell.side].ownedCharacters[displaySlug]
      if (!owned) return null
      const cc = calcCharacterCost(displaySlug, owned.constellation, state.ruleset.costRules)
      return {
        level: owned.level,
        characterCost: cc,
        weaponCost: 0,
        totalCost: cc,
        extraSeconds: 0,
        weapon: null,
        refinement: 0,
      }
    })()

    const roundingCls =
      positionInGroup === 'single'
        ? 'rounded-md'
        : positionInGroup === 'first'
          ? 'rounded-l-md rounded-r-none'
          : positionInGroup === 'last'
            ? '-ml-px rounded-r-md rounded-l-none'
            : '-ml-px rounded-none'

    const inner = (
      <div
        className={cn(
          'relative flex shrink-0 flex-col overflow-hidden border transition',
          isBan ? 'aspect-[3/4]' : 'aspect-[3/4.5]',
          fluidMobile ? 'w-full md:w-[var(--slot-w)]' : 'w-[var(--slot-w)]',
          roundingCls,
          isActive
            ? 'draft-slot-active-ring z-20 border-gold-strong/60 bg-gold/20 shadow-[0_0_16px_rgba(244,223,168,0.5)]'
            : isInActiveGroup
              ? 'z-10 border-gold-strong bg-gold/15 ring-1 ring-gold/70 shadow-[0_0_12px_rgba(244,223,168,0.35)]'
              : isNextUp
                ? 'z-10 border-blue-400 bg-blue-500/25 ring-1 ring-blue-400/80 shadow-[0_0_14px_rgba(96,165,250,0.45)]'
                : cell.status === 'upcoming'
                  ? isBlue
                    ? 'border-hydro/30 bg-hydro/5'
                    : 'border-danger/30 bg-danger/5'
                  : isBan
                    ? 'border-danger/80 bg-bg/80'
                    : isBlue
                      ? 'border-hydro/65 bg-bg/80'
                      : 'border-danger/65 bg-bg/80',
          canClickPick && 'cursor-pointer hover:z-10 hover:-translate-y-0.5 hover:border-gold-strong',
        )}
        title={
          char
            ? `${isBan ? 'BAN' : 'PICK'}${isActive ? ' (Đang chọn)' : ''}: ${char.name}${constellation !== null ? ` (C${constellation})` : ''}${
                pickInfo
                  ? ` · Lv${pickInfo.level} · Cost ${formatCost(pickInfo.totalCost)} (NV ${formatCost(pickInfo.characterCost)} + VK ${formatCost(pickInfo.weaponCost)})${
                      pickInfo.extraSeconds > 0 ? ` · +${formatSeconds(pickInfo.extraSeconds)}` : ''
                    }`
                  : ''
              }`
            : cell.status === 'done' && isBan
              ? 'Bỏ qua lượt Ban'
              : `Bước ${cell.step} (${cell.action.toUpperCase()})${isNextUp ? ' (Chuẩn bị lượt kế tiếp)' : ''}`
        }
      >
        {char ? (
          <>
            <div
              className={cn(
                'relative min-h-0 flex-1 overflow-hidden bg-gradient-to-br',
                char.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
              )}
            >
              <img
                src={char.icon}
                alt={char.name}
                className={cn(
                  'size-full object-cover',
                  isBan && 'opacity-75 grayscale contrast-125',
                  isActive && 'opacity-90',
                )}
              />
              {isBan && (
                <span className="absolute top-0.5 left-0.5 rounded bg-danger px-1 py-0.5 text-[8px] font-black uppercase leading-none text-white lg:text-[9px] 2xl:text-[10px]">
                  BAN
                </span>
              )}
              {isTravelerElementSlug(displaySlug) && char.element && (
                <ElementIcon
                  element={char.element}
                  className={cn(
                    'absolute size-3.5 drop-shadow lg:size-4 2xl:size-4.5',
                    isBan ? 'bottom-0.5 left-0.5' : 'top-0.5 left-0.5',
                  )}
                />
              )}
              {isActive && (
                <span className="absolute top-0.5 right-0.5 rounded bg-gold-strong px-1 py-0.5 text-[8px] font-black uppercase leading-none text-black lg:text-[9px] 2xl:text-[10px]">
                  Chọn
                </span>
              )}
              {pickInfo && (
                <span
                  data-slot-level
                  className={cn(
                    'absolute bottom-1 left-1 rounded px-1 py-0.5 font-mono text-[9px] font-extrabold leading-none lg:text-[10px] 2xl:text-[11px]',
                    pickInfo.level === 100
                      ? 'bg-gradient-to-r from-gold-strong to-geo text-bg'
                      : pickInfo.level === 95
                        ? 'bg-hydro text-bg'
                        : 'bg-black/80 text-white',
                  )}
                >
                  Lv{pickInfo.level}
                </span>
              )}
              {constellation !== null && (
                <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[9px] font-extrabold leading-none text-gold-strong lg:text-[10px] 2xl:text-[11px]">
                  C{constellation}
                </span>
              )}
              {cell.pickSlot &&
                (pickInfo?.weapon ? (
                  <img
                    src={pickInfo.weapon.icon}
                    alt={pickInfo.weapon.name}
                    title={`${pickInfo.weapon.name} R${pickInfo.refinement} · +${formatCost(pickInfo.weaponCost)} cost`}
                    className="absolute top-0.5 right-0.5 size-4.5 rounded bg-black/60 object-contain ring-1 ring-black/60 lg:size-5 2xl:size-6"
                  />
                ) : (
                  <span
                    title="Mặc định vũ khí 4★ (0 cost)"
                    className="absolute top-1 right-1 size-2 rounded-full bg-gold ring-1 ring-black/60 lg:size-2.5"
                  />
                ))}
            </div>
            <div className="truncate bg-white px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-black lg:text-[10px] 2xl:py-1 2xl:text-xs">
              {char.name}
            </div>
            {pickInfo && (
              <div className="flex flex-wrap items-center justify-center gap-x-1 bg-black/85 px-1 py-0.5 font-mono text-[9px] font-bold leading-tight lg:text-[10px] 2xl:py-1 2xl:text-xs">
                <span data-slot-cost className="text-gold-strong">
                  {formatCost(pickInfo.totalCost)}
                  {pickInfo.extraSeconds > 0 ? (
                    <span className="font-sans text-[0.9em] font-medium text-muted">c</span>
                  ) : (
                    <span className="hidden font-sans font-medium text-muted xl:inline"> cost</span>
                  )}
                </span>
                {pickInfo.extraSeconds > 0 && (
                  <span data-slot-extra className="text-pyro">
                    +{formatSeconds(pickInfo.extraSeconds)}
                  </span>
                )}
              </div>
            )}
          </>
        ) : cell.status !== 'done' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
            <span
              className={cn(
                'text-lg font-black leading-none lg:text-xl 2xl:text-2xl',
                isActive || isInActiveGroup
                  ? 'text-gold-strong'
                  : isNextUp
                    ? 'text-blue-200'
                    : 'text-text/45',
              )}
            >
              {cell.step}
            </span>
            <span
              className={cn(
                'text-[9px] font-bold uppercase tracking-wider lg:text-[10px] 2xl:text-xs',
                isActive || isInActiveGroup
                  ? 'text-gold-strong'
                  : isNextUp
                    ? 'text-blue-300'
                    : isBan
                      ? 'text-danger/70'
                      : 'text-hydro/70',
              )}
            >
              {cell.action}
            </span>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-bg/70 px-1 text-center">
            <span className="text-[9px] font-bold uppercase text-muted">Bỏ qua</span>
          </div>
        )}
      </div>
    )

    if (canClickPick && cell.pickSlot) {
      const pick = cell.pickSlot
      return (
        <button
          key={cell.step}
          type="button"
          onClick={() => onSelectPickSlot?.(cell.side, pick)}
          className="text-left focus:outline-none"
        >
          {inner}
        </button>
      )
    }

    return <div key={cell.step}>{inner}</div>
  }

  const renderRows = (rows: DraftBoardCell[][], align: 'end' | 'start', spaced = false) =>
    rows
      .flatMap((row) => chunkMaxFour(row))
      .map((row, rIdx) => (
        <div
          key={rIdx}
          className={cn(
            spaced
              ? cn(
                  'grid w-full gap-1 sm:gap-1.5 md:flex md:w-auto md:flex-nowrap md:items-center md:gap-1.5 lg:gap-2 2xl:gap-2.5',
                  maxPickCols <= 3 ? 'grid-cols-3' : 'grid-cols-4',
                )
              : 'flex flex-nowrap items-center justify-center gap-0',
            align === 'end' ? 'md:justify-end' : 'md:justify-start',
          )}
        >
          {row.map((cell, cIdx) => {
            const pos = spaced
              ? 'single'
              : row.length === 1
                ? 'single'
                : cIdx === 0
                  ? 'first'
                  : cIdx === row.length - 1
                    ? 'last'
                    : 'middle'
            return renderCell(cell, pos, spaced)
          })}
        </div>
      ))

  const renderMobileBanRow = (rows: DraftBoardCell[][]) => {
    const flatBans = rows.flat()
    if (flatBans.length === 0) return null
    return (
      <div className="flex flex-wrap items-center justify-center gap-1 [--slot-w:2.75rem] sm:[--slot-w:3.25rem]">
        {flatBans.map((cell) => renderCell(cell, 'single', false))}
      </div>
    )
  }

  const renderCompactBanStrip = (side: MatchSide) => {
    const bans = state.sides[side].bans
    const opponentSide: MatchSide = side === 'blue' ? 'red' : 'blue'
    if (bans.length === 0) return <span className="text-xs text-muted">—</span>
    return (
      <div className="flex items-center gap-1">
        {bans.map((slug, idx) => {
          const ch = slug
            ? resolveCharacterForOwned(
                slug,
                state.sides[opponentSide].ownedCharacters,
                state.sides[side].ownedCharacters,
              ) ?? null
            : null
          return ch ? (
            <span key={`${side}-ban-${idx}`} className="relative inline-block size-7">
              <img
                src={ch.icon}
                alt={ch.name}
                title={`Ban: ${ch.name}`}
                className="size-7 rounded border border-danger/60 object-cover grayscale"
              />
              {slug && isTravelerElementSlug(slug) && ch.element && (
                <ElementIcon
                  element={ch.element}
                  className="absolute right-0 bottom-0 size-3 rounded-full bg-black/75 p-0.2"
                />
              )}
            </span>
          ) : (
            <span
              key={`${side}-ban-${idx}`}
              title="Bỏ qua Ban"
              className="flex size-7 items-center justify-center rounded border border-line/60 bg-bg/60 text-xs text-muted"
            >
              —
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <section aria-label="Bảng thứ tự Ban và Pick" className="flex flex-col gap-2">
      {/* Thanh tóm tắt gọn sau khi Draft xong trên Mobile & iPad (< xl) */}
      {isPostDraft && (
        <div className="panel grid grid-cols-2 items-center gap-2 px-3 py-2 sm:flex sm:items-center sm:justify-between xl:hidden">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-hydro">Xanh</span>
            {renderCompactBanStrip('blue')}
          </div>

          <div className="flex items-center justify-end gap-1.5 sm:order-3">
            {renderCompactBanStrip('red')}
            <span className="text-xs font-bold text-danger">Đỏ</span>
          </div>

          <button
            type="button"
            onClick={() => setShowFullBoardMobile((v) => !v)}
            aria-expanded={showFullBoardMobile}
            className="col-span-2 h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2 px-3 text-xs font-semibold text-gold-strong transition hover:border-gold/60 sm:order-2 sm:w-auto"
          >
            {showFullBoardMobile ? 'Ẩn bảng Draft ▴' : 'Bảng thứ tự Draft ▾'}
          </button>
        </div>
      )}

      <div
        className={cn(
          'panel border-line/70 bg-bg/55 px-2.5 py-2.5 sm:px-3.5 sm:py-3 xl:px-2 xl:py-2.5',
          isPostDraft && !showFullBoardMobile && 'hidden xl:block',
        )}
      >
        <div
          className={cn(
            'grid grid-cols-2 items-start gap-2.5 sm:gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-2.5 lg:gap-3 xl:items-center',
            banSlotSizeCls,
          )}
        >
          {/* Blue: Thông tin Cost sát viền trái + khối Pick ở ngoài + khối Ban ở gần tâm */}
          <div className="flex min-w-0 flex-col items-stretch gap-2 md:items-end xl:flex-row xl:items-center xl:justify-end xl:gap-2.5 2xl:gap-4">
            {renderSideStats('blue')}

            <div
              data-side-slots="blue"
              className="order-1 flex w-full flex-col-reverse items-stretch gap-2 sm:gap-3 md:w-auto md:flex-row md:items-center md:justify-end md:gap-2.5 lg:gap-4 xl:order-2 xl:gap-3 2xl:gap-5"
            >
              <div
                className={cn(
                  'flex w-full flex-col items-center gap-1 md:w-auto md:items-end md:gap-1.5 xl:border xl:border-transparent xl:py-1.5',
                  pickSlotSizeCls,
                )}
              >
                <span className="text-[10px] font-bold tracking-widest text-gold-strong/85 uppercase">
                  PICK
                </span>
                <div className="flex w-full flex-col gap-1.5 md:w-auto">
                  {renderRows(board.blue.pickRows, 'end', true)}
                </div>
              </div>

              {board.blue.banRows.length > 0 && (
                <div
                  data-ban-slots="blue"
                  className="flex flex-col items-center gap-1 md:items-end md:gap-1.5 xl:rounded-lg xl:border xl:border-danger/25 xl:bg-danger/5 xl:px-2 xl:py-1.5"
                >
                  <span className="text-[10px] font-bold tracking-widest text-danger/85 uppercase">
                    BAN
                  </span>
                  <div className="md:hidden">{renderMobileBanRow(board.blue.banRows)}</div>
                  <div className="hidden flex-col gap-1.5 md:flex">
                    {renderRows(board.blue.banRows, 'end')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Nhãn giữa */}
          <div className="hidden items-center justify-center px-1 md:flex md:self-center xl:px-1.5">
            <span className="rounded-md border border-line/70 bg-panel-2/70 px-2 py-1 text-[11px] font-extrabold tracking-widest text-muted uppercase lg:px-2.5 xl:px-3 xl:py-1.5 xl:text-xs">
              {state.status === 'drafting' ? 'BAN / PICK' : 'PICKS'}
            </span>
          </div>

          {/* Red: Khối Ban ở gần tâm + khối Pick ở ngoài + thông tin Cost sát viền phải */}
          <div className="flex min-w-0 flex-col items-stretch gap-2 md:items-start xl:flex-row xl:items-center xl:justify-start xl:gap-2.5 2xl:gap-4">
            <div
              data-side-slots="red"
              className="order-1 flex w-full flex-col items-stretch gap-2 sm:gap-3 md:w-auto md:flex-row md:items-center md:justify-start md:gap-2.5 lg:gap-4 xl:order-1 xl:gap-3 2xl:gap-5"
            >
              {board.red.banRows.length > 0 && (
                <div
                  data-ban-slots="red"
                  className="flex flex-col items-center gap-1 md:items-start md:gap-1.5 xl:rounded-lg xl:border xl:border-danger/25 xl:bg-danger/5 xl:px-2 xl:py-1.5"
                >
                  <span className="text-[10px] font-bold tracking-widest text-danger/85 uppercase">
                    BAN
                  </span>
                  <div className="md:hidden">{renderMobileBanRow(board.red.banRows)}</div>
                  <div className="hidden flex-col gap-1.5 md:flex">
                    {renderRows(board.red.banRows, 'start')}
                  </div>
                </div>
              )}

              <div
                className={cn(
                  'flex w-full flex-col items-center gap-1 md:w-auto md:items-start md:gap-1.5 xl:border xl:border-transparent xl:py-1.5',
                  pickSlotSizeCls,
                )}
              >
                <span className="text-[10px] font-bold tracking-widest text-gold-strong/85 uppercase">
                  PICK
                </span>
                <div className="flex w-full flex-col gap-1.5 md:w-auto">
                  {renderRows(board.red.pickRows, 'start', true)}
                </div>
              </div>
            </div>

            {renderSideStats('red')}
          </div>
        </div>

        {/* Toggle chi tiết Cost & Mốc quy đổi trên Mobile (< md) */}
        <button
          type="button"
          onClick={() => setShowMobileStats((v) => !v)}
          aria-expanded={showMobileStats}
          className="mt-2.5 flex h-9 w-full cursor-pointer items-center justify-center gap-1 border-t border-line/40 pt-1 text-xs font-medium text-muted hover:text-text md:hidden"
        >
          {showMobileStats ? 'Thu gọn chi tiết Cost ▴' : 'Chi tiết Cost & Mốc quy đổi ▾'}
        </button>
      </div>
    </section>
  )
}
