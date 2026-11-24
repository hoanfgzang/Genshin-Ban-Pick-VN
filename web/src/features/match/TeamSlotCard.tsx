import type { DragEvent } from 'react'
import { ElementIcon } from '@/components/ui/ElementIcon'
import type { Element } from '@/domain/character'
import { getCharacter } from '@/domain/characters'
import { formatCost, formatSeconds } from '@/domain/cost'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot } from '@/services'

interface Props {
  pick: MatchPickSlot
  slotInTeam: number
  canReorder: boolean
  canEditWeapon: boolean
  isSelectedForSwap: boolean
  isDropTarget: boolean
  onClickCharacter: () => void
  onDragStart: (e: DragEvent<HTMLElement>) => void
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onClickWeapon: () => void
}

const ELEMENT_GLOW: Record<Element, string> = {
  pyro: 'from-pyro/30 via-transparent to-transparent',
  hydro: 'from-hydro/30 via-transparent to-transparent',
  anemo: 'from-anemo/30 via-transparent to-transparent',
  electro: 'from-electro/30 via-transparent to-transparent',
  dendro: 'from-dendro/30 via-transparent to-transparent',
  cryo: 'from-cryo/30 via-transparent to-transparent',
  geo: 'from-geo/30 via-transparent to-transparent',
}

export function TeamSlotCard({
  pick,
  slotInTeam,
  canReorder,
  canEditWeapon,
  isSelectedForSwap,
  isDropTarget,
  onClickCharacter,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onClickWeapon,
}: Props) {
  const char = getCharacter(pick.characterSlug)
  const weapon = pick.weaponSlug ? getWeapon(pick.weaponSlug) : null
  const weaponRefSec = pick.weaponRefinementSeconds ?? 0

  const cardInner = (
    <>
      {/* Nền gradient độ hiếm + ánh sáng nguyên tố */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden bg-gradient-to-b',
          char?.rarity === 5 ? 'from-r5-from/85 via-bg/70 to-r5-to/90' : 'from-r4-from/85 via-bg/70 to-r4-to/90',
        )}
      >
        {char?.element && (
          <div
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-0 bg-gradient-to-t', ELEMENT_GLOW[char.element])}
          />
        )}

        {char && (
          <img
            src={char.card ?? char.icon}
            alt={char.name}
            draggable={false}
            loading="lazy"
            className={cn(
              'absolute inset-0 size-full select-none transition-transform duration-200',
              char.card ? 'object-cover object-center' : 'object-contain p-2',
              canReorder && 'group-hover:scale-105',
            )}
          />
        )}

        {/* Số thứ tự vị trí trong team (1..4) */}
        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-text/90">
          {slotInTeam}
        </span>

        {/* Nguyên tố & biểu tượng kéo */}
        <div className="absolute top-1 right-1 flex items-center gap-1">
          {canReorder && (
            <span
              aria-hidden="true"
              className="rounded bg-black/60 px-1 py-0.5 text-[10px] leading-none text-gold-strong opacity-80 group-hover:opacity-100"
            >
              ⋮⋮
            </span>
          )}
          {char?.element && <ElementIcon element={char.element} className="size-3.5" />}
        </div>

        {/* Lv | C{n} & cost nổi bật trên đáy ảnh chân dung */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1.5 pt-4 pb-1">
          <span
            className={cn(
              'rounded px-1 py-0.5 font-mono text-[10px] font-black leading-none',
              pick.level === 100
                ? 'bg-gradient-to-r from-gold-strong to-geo text-bg'
                : pick.level === 95
                  ? 'bg-hydro text-bg'
                  : 'bg-black/75 text-white',
            )}
          >
            {pick.level}|C{pick.constellation}
          </span>
          {pick.characterCost > 0 && (
            <span className="rounded bg-black/80 px-1 py-0.5 text-[10px] font-bold leading-none text-gold-strong">
              +{formatCost(pick.characterCost)}
            </span>
          )}
        </div>
      </div>

      {/* Thanh đáy hiển thị tên nhân vật: chữ đen nền trắng */}
      <div className="truncate bg-white px-1.5 py-1 text-center text-[11px] font-bold leading-tight text-black">
        {char?.name ?? pick.characterSlug}
      </div>
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* Thẻ nhân vật dọc (kéo-thả hoặc bấm để đổi vị trí) */}
      {canReorder ? (
        <button
          type="button"
          draggable
          onClick={onClickCharacter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          title={`${char?.name ?? pick.characterSlug} · Kéo hoặc bấm để đổi vị trí`}
          aria-pressed={isSelectedForSwap}
          className={cn(
            'group relative flex aspect-[2/4.6] min-h-40 w-full cursor-grab flex-col overflow-hidden rounded-lg border text-left transition active:cursor-grabbing sm:min-h-48',
            isSelectedForSwap
              ? 'border-gold-strong ring-2 ring-gold-strong shadow-[0_0_18px_rgba(244,223,168,0.45)]'
              : isDropTarget
                ? 'scale-[1.03] border-gold-strong ring-2 ring-gold'
                : 'border-line/80 hover:-translate-y-0.5 hover:border-gold',
          )}
        >
          {cardInner}
        </button>
      ) : (
        <div className="relative flex aspect-[2/4.6] min-h-40 w-full flex-col overflow-hidden rounded-lg border border-line/80 sm:min-h-48">
          {cardInner}
        </div>
      )}

      {/* Ô vũ khí ngay phía dưới thẻ nhân vật */}
      <button
        type="button"
        disabled={!canEditWeapon}
        onClick={onClickWeapon}
        title={
          weapon
            ? `${weapon.name} (R${pick.refinement} · +${formatCost(pick.weaponCost)} cost${weaponRefSec > 0 ? ` · +${formatSeconds(weaponRefSec)}` : ''})`
            : canEditWeapon
              ? 'Bấm để chọn vũ khí'
              : 'Chưa gắn vũ khí'
        }
        className={cn(
          'relative flex h-20 flex-col overflow-hidden rounded-lg border transition',
          canEditWeapon ? 'cursor-pointer hover:border-gold-strong' : 'cursor-default',
          weapon
            ? 'border-line/80 bg-panel-2/80'
            : canEditWeapon
              ? 'border-dashed border-gold/65 bg-gold/10 hover:bg-gold/15'
              : 'border-dashed border-line/50 bg-bg/40',
        )}
      >
        {weapon ? (
          <>
            <div
              className={cn(
                'relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br p-1',
                weapon.rarity === 5 ? 'from-r5-from/80 to-r5-to/80' : 'from-r4-from/80 to-r4-to/80',
              )}
            >
              <img
                src={weapon.icon}
                alt={weapon.name}
                loading="lazy"
                className="size-10 object-contain drop-shadow"
              />
              {weaponRefSec > 0 && (
                <span className="absolute top-0.5 left-0.5 rounded bg-black/80 px-1 py-0.2 text-[9px] font-bold text-pyro">
                  +{formatSeconds(weaponRefSec)}
                </span>
              )}
              {pick.weaponCost > 0 && (
                <span className="absolute top-0.5 right-0.5 rounded bg-black/75 px-1 py-0.2 text-[9px] font-bold text-gold-strong">
                  +{formatCost(pick.weaponCost)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 bg-black/85 px-1 py-0.5 font-mono text-[10px] font-bold text-text">
              <span className="truncate font-sans font-medium text-muted max-w-[65%]">
                {weapon.name}
              </span>
              <span className="text-gold-strong">R{pick.refinement}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center">
            <span className={cn('text-xs font-bold', canEditWeapon ? 'text-gold-strong' : 'text-muted/60')}>
              {canEditWeapon ? '+ Vũ khí' : '—'}
            </span>
            {canEditWeapon && <span className="text-[9px] text-muted">Bấm để chọn</span>}
          </div>
        )}
      </button>
    </div>
  )
}
