import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { Segmented } from '@/components/ui/Segmented'
import { ELEMENT_LABEL, ELEMENTS, WEAPON_LABEL, WEAPONS, type Rarity } from '@/domain/character'
import { cn } from '@/lib/cn'
import {
  DEFAULT_FILTER,
  isFilterActive,
  type InventoryFilter,
  type OwnershipFilter,
  type SortKey,
} from './filter'

interface Props {
  filter: InventoryFilter
  onChange: (f: InventoryFilter) => void
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

const OWN_OPTIONS: { value: OwnershipFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'owned', label: 'Đã có' },
  { value: 'missing', label: 'Chưa có' },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'rarity', label: 'Độ hiếm' },
  { value: 'release', label: 'Mới nhất' },
  { value: 'name', label: 'Tên A–Z' },
  { value: 'constellation', label: 'Cung mệnh' },
  { value: 'level', label: 'Level' },
]

export function InventoryFilters({ filter, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<InventoryFilter>) => onChange({ ...filter, ...patch })
  const activeCount =
    filter.elements.length +
    filter.weapons.length +
    filter.rarities.length +
    (filter.ownership !== 'all' ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-44 flex-1">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
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
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Tìm nhân vật…"
            aria-label="Tìm nhân vật"
            className="h-10 w-full rounded-lg border border-line bg-bg/60 pr-3 pl-9 text-sm focus:border-gold focus:ring-2 focus:ring-gold/25 focus:outline-none"
          />
        </div>

        <Button
          size="md"
          variant={open || activeCount > 0 ? 'secondary' : 'ghost'}
          className="md:hidden"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Bộ lọc{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>

        <div
          className={cn(
            'w-full flex-wrap items-center gap-2.5 md:w-auto',
            open ? 'flex' : 'hidden md:flex',
          )}
        >
          <Segmented
            label="Lọc sở hữu"
            size="sm"
            value={filter.ownership}
            options={OWN_OPTIONS}
            onChange={(ownership) => set({ ownership })}
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            Sắp xếp
            <select
              value={filter.sort}
              onChange={(e) => set({ sort: e.target.value as SortKey })}
              className="h-9 cursor-pointer rounded-lg border border-line bg-bg/60 px-2 text-sm text-text focus:border-gold focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        className={cn('flex-wrap items-center gap-2', open ? 'flex' : 'hidden md:flex')}
        role="group"
        aria-label="Lọc theo nguyên tố, độ hiếm, vũ khí"
      >
        {ELEMENTS.map((el) => (
          <Chip
            key={el}
            active={filter.elements.includes(el)}
            onClick={() => set({ elements: toggle(filter.elements, el) })}
          >
            <ElementIcon element={el} className="size-3.5" />
            {ELEMENT_LABEL[el]}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {([5, 4] as Rarity[]).map((r) => (
          <Chip
            key={r}
            active={filter.rarities.includes(r)}
            onClick={() => set({ rarities: toggle(filter.rarities, r) })}
          >
            <span className={r === 5 ? 'text-geo' : 'text-electro'}>★</span>
            {r} sao
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {WEAPONS.map((w) => (
          <Chip
            key={w}
            active={filter.weapons.includes(w)}
            onClick={() => set({ weapons: toggle(filter.weapons, w) })}
          >
            {WEAPON_LABEL[w]}
          </Chip>
        ))}
        {isFilterActive(filter) && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTER, sort: filter.sort })}
            className="ml-1 cursor-pointer text-xs text-gold underline-offset-2 hover:underline"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>
    </div>
  )
}
