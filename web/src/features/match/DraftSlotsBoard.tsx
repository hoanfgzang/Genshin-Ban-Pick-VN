import { useMemo } from 'react'
import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import { buildDraftBoardRows, groupConsecutiveCells, type DraftBoardCell } from './lineup'

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
            ? 'z-10 border-gold-strong bg-gold/15 ring-2 ring-gold-strong shadow-[0_0_16px_rgba(244,223,168,0.4)]'
            : cell.status === 'upcoming'
              ? isBlue
                ? 'border-hydro/35 bg-hydro/10'
                : 'border-danger/35 bg-danger/10'
              : isBan
                ? 'border-danger/80 bg-bg/80'
                : isBlue
                  ? 'border-hydro/65 bg-bg/80'
                  : 'border-danger/65 bg-bg/80',
          canClickPick && 'cursor-pointer hover:-translate-y-0.5 hover:border-gold-strong',
        )}
        title={
          char
            ? `${isBan ? 'BAN' : 'PICK'}${isActive ? ' (Đang chọn)' : ''}: ${char.name}${constellation !== null ? ` (C${constellation})` : ''}`
            : cell.status === 'done' && isBan
              ? 'Bỏ qua lượt Ban'
              : `Bước ${cell.step} (${cell.action.toUpperCase()})`
        }
      >
        {isActive && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-2 ring-gold-strong animate-pulse"
          />
        )}

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
                <span className="absolute right-0.5 bottom-0.5 rounded bg-black/80 px-1 py-0.2 font-mono text-[9px] font-extrabold leading-none text-gold-strong">
                  C{constellation}
                </span>
              )}
              {cell.pickSlot && (
                <span
                  title={cell.pickSlot.weaponSlug ? 'Đã gắn vũ khí' : 'Chưa gắn vũ khí'}
                  className={cn(
                    'absolute top-1 right-1 size-2 rounded-full ring-1 ring-black/60',
                    cell.pickSlot.weaponSlug ? 'bg-success' : 'bg-gold',
                  )}
                />
              )}
            </div>
            <div className="truncate bg-white px-0.5 py-0.5 text-center text-[9px] font-bold leading-tight text-black">
              {char.name}
            </div>
          </>
        ) : cell.status !== 'done' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
            <span
              className={cn(
                'text-lg font-black leading-none',
                isActive ? 'text-gold-strong' : 'text-text/45',
              )}
            >
              {cell.step}
            </span>
            <span
              className={cn(
                'text-[9px] font-bold uppercase tracking-wider',
                isActive
                  ? 'text-gold-strong'
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

  const renderRows = (rows: DraftBoardCell[][], align: 'end' | 'start') =>
    rows.map((row, rIdx) => {
      const groups = groupConsecutiveCells(row)
      return (
        <div
          key={rIdx}
          className={cn(
            'flex flex-wrap items-center justify-center gap-[calc(var(--slot-w)/4)]',
            align === 'end' ? 'md:justify-end' : 'md:justify-start',
          )}
        >
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="flex items-center gap-0">
              {group.map((cell, cIdx) => {
                const pos =
                  group.length === 1
                    ? 'single'
                    : cIdx === 0
                      ? 'first'
                      : cIdx === group.length - 1
                        ? 'last'
                        : 'middle'
                return renderCell(cell, pos)
              })}
            </div>
          ))}
        </div>
      )
    })

  return (
    <section
      aria-label="Bảng thứ tự Ban và Pick"
      className="panel grid grid-cols-1 items-center gap-3 border-line/70 bg-bg/55 px-3 py-2.5 [--slot-w:2.5rem] sm:[--slot-w:3rem] md:grid-cols-[1fr_auto_1fr] md:[--slot-w:2.5rem] lg:[--slot-w:3rem] xl:[--slot-w:3.5rem] 2xl:[--slot-w:4rem]"
    >
      {/* Blue: Khối Pick ở ngoài (trái), cách xa khối Ban ở gần tâm */}
      <div className="flex flex-col items-center gap-4 sm:gap-6 md:flex-row md:items-start md:justify-end md:gap-6 lg:gap-10 xl:gap-14 2xl:gap-16">
        <div className="flex flex-col items-center gap-1.5 md:items-end">
          <span className="text-[10px] font-bold tracking-widest text-gold-strong/85 uppercase">
            PICK
          </span>
          {renderRows(board.blue.pickRows, 'end')}
        </div>

        {board.blue.banRows.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-2 py-1.5 md:items-end">
            <span className="text-[10px] font-bold tracking-widest text-danger/85 uppercase">
              BAN
            </span>
            {renderRows(board.blue.banRows, 'end')}
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
      <div className="flex flex-col items-center gap-4 sm:gap-6 md:flex-row md:items-start md:justify-start md:gap-6 lg:gap-10 xl:gap-14 2xl:gap-16">
        {board.red.banRows.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-2 py-1.5 md:items-start">
            <span className="text-[10px] font-bold tracking-widest text-danger/85 uppercase">
              BAN
            </span>
            {renderRows(board.red.banRows, 'start')}
          </div>
        )}

        <div className="flex flex-col items-center gap-1.5 md:items-start">
          <span className="text-[10px] font-bold tracking-widest text-gold-strong/85 uppercase">
            PICK
          </span>
          {renderRows(board.red.pickRows, 'start')}
        </div>
      </div>
    </section>
  )
}
