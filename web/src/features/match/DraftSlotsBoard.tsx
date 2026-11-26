import { useMemo } from 'react'
import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import { buildDraftBoardRows, getDraftHighlightSets, type DraftBoardCell } from './lineup'

interface Props {
  state: MatchState
  hoverCharacterSlug?: string | null
  canEditWeaponsForSide: (side: MatchSide) => boolean
  onSelectPickSlot?: (side: MatchSide, pick: MatchPickSlot) => void
}

export function DraftSlotsBoard({
  state,
  hoverCharacterSlug = null,
  canEditWeaponsForSide,
  onSelectPickSlot,
}: Props) {
  const isPostDraft = state.status !== 'drafting'

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
    return (
      state.sides[opponent].ownedCharacters[slug]?.constellation ??
      state.sides[side].ownedCharacters[slug]?.constellation ??
      null
    )
  }

  const renderCell = (cell: DraftBoardCell, positionInGroup: 'single' | 'first' | 'middle' | 'last') => {
    const isActive = cell.status === 'active'
    const isInActiveGroup = highlights.activeGroupSteps.has(cell.step)
    const isNextUp = !isInActiveGroup && highlights.nextGroupSteps.has(cell.step)
    const displaySlug =
      cell.status === 'done'
        ? cell.characterSlug
        : isActive
          ? hoverCharacterSlug
          : null
    const char = displaySlug ? getCharacter(displaySlug) : null
    const isBlue = cell.side === 'blue'
    const isBan = cell.action === 'ban'
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
      return state.sides[cell.side].ownedCharacters[displaySlug]?.constellation ?? null
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
          'relative flex aspect-[3/4] w-[var(--slot-w)] shrink-0 flex-col overflow-hidden border transition',
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
            ? `${isBan ? 'BAN' : 'PICK'}${isActive ? ' (Đang chọn)' : ''}: ${char.name}${constellation !== null ? ` (C${constellation})` : ''}`
            : cell.status === 'done' && isBan
              ? 'Bỏ qua lượt Ban'
              : `Bước ${cell.step} (${cell.action.toUpperCase()})${isNextUp ? ' (Chuẩn bị lượt kế tiếp)' : ''}`
        }
      >
        {char ? (
          <>
            <div
              className={cn(
                'relative flex-1 overflow-hidden bg-gradient-to-br',
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
                <span className="absolute top-0.5 left-0.5 rounded bg-danger px-1 py-0.2 text-[8px] font-black uppercase text-white">
                  BAN
                </span>
              )}
              {isActive && (
                <span className="absolute top-0.5 right-0.5 rounded bg-gold-strong px-1 py-0.2 text-[8px] font-black uppercase text-black">
                  Chọn
                </span>
              )}
              {constellation !== null && (
                <span
                  className={cn(
                    'absolute right-0.5 bottom-0.5 rounded bg-black/80 px-1 py-0.2 font-mono font-extrabold leading-none text-gold-strong',
                    isPostDraft && !isBan ? 'text-[10px]' : 'text-[9px]',
                  )}
                >
                  C{constellation}
                </span>
              )}
              {cell.pickSlot && (
                <span
                  title={cell.pickSlot.weaponSlug ? 'Đã gắn vũ khí' : 'Mặc định vũ khí 4★ (0 cost)'}
                  className={cn(
                    'absolute top-1 right-1 size-2 rounded-full ring-1 ring-black/60',
                    cell.pickSlot.weaponSlug ? 'bg-success' : 'bg-gold',
                  )}
                />
              )}
            </div>
            <div
              className={cn(
                'truncate bg-white px-0.5 py-0.5 text-center font-bold leading-tight text-black',
                isPostDraft && !isBan ? 'text-[10px]' : 'text-[9px]',
              )}
            >
              {char.name}
            </div>
          </>
        ) : cell.status !== 'done' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
            <span
              className={cn(
                'text-lg font-black leading-none',
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
                'text-[9px] font-bold uppercase tracking-wider',
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
    rows.map((row, rIdx) => (
      <div
        key={rIdx}
        className={cn(
          'flex flex-wrap items-center justify-center',
          spaced ? 'gap-[calc(var(--slot-w)/5)]' : 'gap-0',
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
          return renderCell(cell, pos)
        })}
      </div>
    ))

  return (
    <section
      aria-label="Bảng thứ tự Ban và Pick"
      className="panel grid grid-cols-1 items-center gap-3 border-line/70 bg-bg/55 px-3 py-2.5 [--slot-w:2.5rem] sm:[--slot-w:3rem] md:grid-cols-[1fr_auto_1fr] md:[--slot-w:2.5rem] lg:[--slot-w:3rem] xl:[--slot-w:3.5rem] 2xl:[--slot-w:4rem]"
    >
      {/* Blue: Khối Pick ở ngoài (trái), cách xa khối Ban ở gần tâm */}
      <div
        className={cn(
          'flex flex-col items-center gap-4 sm:gap-6 md:flex-row md:items-center md:justify-end',
          isPostDraft
            ? 'md:gap-3 lg:gap-6 xl:gap-10 2xl:gap-12'
            : 'md:gap-5 lg:gap-9 xl:gap-12 2xl:gap-14',
        )}
      >
        <div
          className={cn(
            'flex flex-col items-center gap-1.5 border border-transparent py-1.5 md:items-end',
            isPostDraft &&
              '[--slot-w:3rem] sm:[--slot-w:3.5rem] md:[--slot-w:2.625rem] lg:[--slot-w:3.375rem] xl:[--slot-w:4rem] 2xl:[--slot-w:4.5rem]',
          )}
        >
          <span className="text-[10px] font-bold tracking-widest text-gold-strong/85 uppercase">
            PICK
          </span>
          <div className="flex flex-col gap-1.5">
            {renderRows(board.blue.pickRows, 'end', true)}
          </div>
        </div>

        {board.blue.banRows.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-2 py-1.5 md:items-end">
            <span className="text-[10px] font-bold tracking-widest text-danger/85 uppercase">
              BAN
            </span>
            <div className={cn('flex flex-col', isPostDraft ? 'gap-0.5' : 'gap-1')}>
              {renderRows(board.blue.banRows, 'end')}
            </div>
          </div>
        )}
      </div>

      {/* Nhãn giữa */}
      <div className="flex items-center justify-center px-1.5">
        <span className="rounded-md border border-line/70 bg-panel-2/70 px-2.5 py-1 text-[11px] font-extrabold tracking-widest text-muted uppercase xl:px-3 xl:py-1.5 xl:text-xs">
          {state.status === 'drafting' ? 'BAN / PICK' : 'PICKS'}
        </span>
      </div>

      {/* Red: Khối Ban ở gần tâm, cách xa khối Pick ở ngoài (phải) */}
      <div
        className={cn(
          'flex flex-col items-center gap-4 sm:gap-6 md:flex-row md:items-center md:justify-start',
          isPostDraft
            ? 'md:gap-3 lg:gap-6 xl:gap-10 2xl:gap-12'
            : 'md:gap-5 lg:gap-9 xl:gap-12 2xl:gap-14',
        )}
      >
        {board.red.banRows.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-2 py-1.5 md:items-start">
            <span className="text-[10px] font-bold tracking-widest text-danger/85 uppercase">
              BAN
            </span>
            <div className={cn('flex flex-col', isPostDraft ? 'gap-0.5' : 'gap-1')}>
              {renderRows(board.red.banRows, 'start')}
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex flex-col items-center gap-1.5 border border-transparent py-1.5 md:items-start',
            isPostDraft &&
              '[--slot-w:3rem] sm:[--slot-w:3.5rem] md:[--slot-w:2.625rem] lg:[--slot-w:3.375rem] xl:[--slot-w:4rem] 2xl:[--slot-w:4.5rem]',
          )}
        >
          <span className="text-[10px] font-bold tracking-widest text-gold-strong/85 uppercase">
            PICK
          </span>
          <div className="flex flex-col gap-1.5">
            {renderRows(board.red.pickRows, 'start', true)}
          </div>
        </div>
      </div>
    </section>
  )
}
