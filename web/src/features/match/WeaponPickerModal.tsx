import { useMemo, useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { WEAPON_LABEL, type Character } from '@/domain/character'
import { calcWeaponCost, formatCost } from '@/domain/cost'
import type { CostRules } from '@/domain/ruleset'
import { REFINEMENTS, type Refinement, type WeaponRarity } from '@/domain/weapon'
import { getWeaponsForType } from '@/domain/weapons'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  character: Character | null
  costRules: CostRules
  initialWeaponSlug: string | null
  initialRefinement: number
  onSelect: (weaponSlug: string, refinement: Refinement) => void
  onClose: () => void
}

export function WeaponPickerModal({
  open,
  character,
  costRules,
  initialWeaponSlug,
  initialRefinement,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<WeaponRarity | null>(null)
  const [refinement, setRefinement] = useState<Refinement>(
    (initialRefinement >= 1 && initialRefinement <= 5 ? initialRefinement : 1) as Refinement,
  )

  const candidates = useMemo(() => {
    if (!character) return []
    const q = query.trim().toLowerCase()
    return getWeaponsForType(character.weapon).filter((w) => {
      if (q && !w.name.toLowerCase().includes(q) && !w.slug.includes(q)) return false
      if (rarity && w.rarity !== rarity) return false
      return true
    })
  }, [character, query, rarity])

  if (!character) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Chọn vũ khí cho ${character.name}`}
      description={`Loại vũ khí: ${WEAPON_LABEL[character.weapon]} · Chọn tinh luyện R1–R5 rồi bấm vào vũ khí.`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted">Tinh luyện:</span>
            <Segmented
              label="Tinh luyện vũ khí"
              size="sm"
              value={refinement}
              options={REFINEMENTS.map((r) => ({ value: r, label: `R${r}` }))}
              onChange={setRefinement}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {([5, 4, 3] as const).map((r) => (
              <Chip
                key={r}
                active={rarity === r}
                onClick={() => setRarity((cur) => (cur === r ? null : r))}
              >
                {r}★
              </Chip>
            ))}
          </div>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên vũ khí…"
          className="h-9 w-full rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
        />

        <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {candidates.map((w) => {
            const cost = calcWeaponCost(w.slug, refinement, costRules)
            const isSelected = initialWeaponSlug === w.slug
            return (
              <button
                key={w.slug}
                type="button"
                onClick={() => {
                  onSelect(w.slug, refinement)
                  onClose()
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border p-2 text-left transition hover:border-gold',
                  isSelected ? 'border-gold bg-gold/15' : 'border-line bg-bg/50 hover:bg-panel-2',
                )}
              >
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br p-0.5',
                    w.rarity === 5
                      ? 'from-r5-from to-r5-to'
                      : w.rarity === 4
                        ? 'from-r4-from to-r4-to'
                        : 'from-slate-700 to-slate-500',
                  )}
                >
                  <img src={w.icon} alt="" className="size-full object-contain" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-text">{w.name}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px]">
                    <span className="text-muted">
                      {w.rarity}★ · R{refinement}
                    </span>
                    <span className={cost > 0 ? 'font-bold text-gold-strong' : 'text-muted'}>
                      +{formatCost(cost)} cost
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
          {candidates.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted">
              Không tìm thấy vũ khí phù hợp.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
