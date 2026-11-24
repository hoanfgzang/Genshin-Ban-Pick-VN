import { useMemo } from 'react'
import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, MatchState } from '@/services'
import { buildDraftBoardRows, type DraftBoardCell } from './lineup'

interface Props {
  state: MatchState
  canEditWeaponsForSide: (side: MatchSide) => boolean
  onSelectPickSlot?: (side: MatchSide, pick: MatchPickSlot) => void
}

export function DraftSlotsBoard({
  state,
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

  const renderCell = (cell: DraftBoardCell) => {
    const char = cell.characterSlug ? getCharacter(cell.characterSlug) : null
    const isBlue = cell.side === 'blue'
    const isBan = cell.action === 'ban'
    const canClickPick =
      cell.action === 'pick' &&
      !!cell.pickSlot &&
      canEditWeaponsForSide(cell.side) &&
      !!onSelectPickSlot

    const constellation = isBan
      ? lookupBanConstellation(cell.side, cell.characterSlug)
      : cell.constellation

    const inner = (
      <div
        className={cn(
          'relative flex aspect-[4/5] w-10 shrink-0 flex-col overflow-hidden rounded-md border transition sm:w-12 md:w-10 lg:w-12 xl:w-14 2xl:w-16',
          cell.status === 'active'
            ? 'border-gold-strong bg-gold/15 ring-2 ring-gold-strong/80 shadow-[0_0_16px_rgba(244,223,168,0.35)]'
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
            ? `${isBan ? 'BAN' : 'PICK'}: ${char.name}${constellation !== null ? ` (C${constellation})` : ''}`
            : cell.status === 'done' && isBan
              ? 'Bỏ qua lượt Ban'
              : `Bước ${cell.step} (${cell.action.toUpperCase()})`
        }
      >
        {cell.status !== 'done' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
            <span
              className={cn(
                'text-lg font-black leading-none',
                cell.status === 'active' ? 'text-gold-strong' : 'text-text/45',
              )}
            >
              {cell.step}
            </span>
            <span
              className={cn(
                'text-[9px] font-bold uppercase tracking-wider',
                cell.status === 'active'
                  ? 'text-gold-strong'
                  : isBan
                    ? 'text-danger/70'
                    : 'text-hydro/70',
              )}
            >
              {cell.action}
            </span>
          </div>
        ) : char ? (
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
                  isBan && 'opacity-70 grayscale contrast-125',
                )}
              />
              {isBan && (
                <span className="absolute top-0.5 left-0.5 rounded bg-danger px-1 py-0.2 text-[8px] font-black uppercase text-white">
                  BAN
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
            <div className="bg-black/85 py-0.5 text-center text-[10px] font-extrabold leading-tight text-text">
              {constellation !== null ? `C${constellation}` : '—'}
            </div>
          </>
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
    rows.map((row, rIdx) => (
      <div
        key={rIdx}
        className={cn(
          'flex flex-wrap justify-center gap-1 xl:gap-1.5',
          align === 'end' ? 'md:justify-end' : 'md:justify-start',
        )}
      >
        {row.map(renderCell)}
      </div>
    ))

  return (
    <section
      aria-label="Bảng thứ tự Ban và Pick"
      className="panel grid grid-cols-1 items-center gap-3 border-line/70 bg-bg/55 px-3 py-2.5 md:grid-cols-[1fr_auto_1fr]"
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
