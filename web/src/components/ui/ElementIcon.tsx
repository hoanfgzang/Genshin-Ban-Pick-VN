import { ELEMENT_LABEL, type Element } from '@/domain/character'
import { cn } from '@/lib/cn'

const COLOR: Record<Element, string> = {
  pyro: 'bg-pyro',
  hydro: 'bg-hydro',
  anemo: 'bg-anemo',
  electro: 'bg-electro',
  dendro: 'bg-dendro',
  cryo: 'bg-cryo',
  geo: 'bg-geo',
}

/** Biểu tượng nguyên tố tạm (hình thoi + chữ cái đầu). */
export function ElementIcon({ element, className }: { element: Element; className?: string }) {
  const label = ELEMENT_LABEL[element]
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-5 shrink-0 rotate-45 items-center justify-center rounded-[4px] shadow ring-1 ring-black/30',
        COLOR[element],
        className,
      )}
    >
      <span className="-rotate-45 text-[10px] leading-none font-extrabold text-black/70">
        {label[0]}
      </span>
    </span>
  )
}
