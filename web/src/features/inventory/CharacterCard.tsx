import type { Character } from '@/domain/character'
import { ELEMENT_LABEL } from '@/domain/character'
import type { OwnedCharacter } from '@/domain/inventory'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { cn } from '@/lib/cn'

interface CharacterCardProps {
  character: Character
  owned: OwnedCharacter | undefined
  mode: 'edit' | 'quick'
  onClick: () => void
}

const LEVEL_STYLE: Record<number, string> = {
  90: 'bg-black/60 text-text',
  95: 'bg-hydro/85 text-black',
  100: 'bg-gradient-to-r from-gold-strong to-geo text-black',
}

export function CharacterCard({ character: c, owned, mode, onClick }: CharacterCardProps) {
  const label = [
    c.name,
    c.element ? ELEMENT_LABEL[c.element] : null,
    `${c.rarity} sao`,
    owned ? `đã sở hữu, C${owned.constellation}, Lv${owned.level}` : 'chưa sở hữu',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={mode === 'quick' ? !!owned : undefined}
      title={c.name}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40',
        owned ? 'border-gold/40 hover:border-gold' : 'border-line/60 hover:border-line',
      )}
    >
      <div
        className={cn(
          'relative aspect-square w-full bg-gradient-to-br',
          c.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
          !owned && 'opacity-35 grayscale group-hover:opacity-60',
        )}
      >
        <img
          src={c.icon}
          alt=""
          loading="lazy"
          width={128}
          height={128}
          className="size-full object-cover"
        />
        {c.element && <ElementIcon element={c.element} className="absolute top-1.5 left-1.5 size-4" />}

        {owned && (
          <>
            <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[11px] leading-none font-bold text-gold-strong">
              C{owned.constellation}
            </span>
            <span
              className={cn(
                'absolute right-1 bottom-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-bold',
                LEVEL_STYLE[owned.level],
              )}
            >
              {owned.level}
            </span>
          </>
        )}
        {mode === 'quick' && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border-2 text-[11px] font-bold',
              owned ? 'border-gold bg-gold text-bg' : 'border-white/60 bg-black/40',
            )}
          >
            {owned ? '✓' : ''}
          </span>
        )}
      </div>
      <span className="truncate bg-white px-1.5 py-1 text-center text-[11px] font-semibold text-black">
        {c.name}
      </span>
    </button>
  )
}
