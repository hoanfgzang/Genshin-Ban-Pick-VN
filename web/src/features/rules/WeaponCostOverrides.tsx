import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { WEAPON_LABEL, WEAPONS, type WeaponType } from '@/domain/character'
import type { CostRules } from '@/domain/ruleset'
import { REFINEMENTS, type WeaponRarity } from '@/domain/weapon'
import { WEAPONS_LIST } from '@/domain/weapons'

interface Props {
  costRules: CostRules
  onChange: (next: CostRules) => void
}

export function WeaponCostOverrides({ costRules, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [weaponType, setWeaponType] = useState<WeaponType | null>(null)
  const [rarity, setRarity] = useState<WeaponRarity | null>(null)
  const [onlyOverridden, setOnlyOverridden] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return WEAPONS_LIST.filter((w) => {
      if (q && !w.name.toLowerCase().includes(q) && !w.slug.includes(q)) return false
      if (weaponType && w.weaponType !== weaponType) return false
      if (rarity && w.rarity !== rarity) return false
      if (onlyOverridden && !(w.slug in costRules.weaponOverrides)) return false
      return true
    })
  }, [query, weaponType, rarity, onlyOverridden, costRules.weaponOverrides])

  const updateCell = (slug: string, baseDefaults: number[], rIdx: number, val: number) => {
    const current = costRules.weaponOverrides[slug] ?? [...baseDefaults]
    const updated = current.map((old, i) => (i === rIdx ? val : old))
    onChange({
      ...costRules,
      weaponOverrides: {
        ...costRules.weaponOverrides,
        [slug]: updated,
      },
    })
  }

  const clearOverride = (slug: string) => {
    const next = { ...costRules.weaponOverrides }
    delete next[slug]
    onChange({ ...costRules, weaponOverrides: next })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm vũ khí…"
          className="h-9 w-full max-w-xs rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
        />
        {([5, 4, 3] as const).map((r) => (
          <Chip key={r} active={rarity === r} onClick={() => setRarity((cur) => (cur === r ? null : r))}>
            {r}★
          </Chip>
        ))}
        {WEAPONS.map((wt) => (
          <Chip
            key={wt}
            active={weaponType === wt}
            onClick={() => setWeaponType((cur) => (cur === wt ? null : wt))}
          >
            {WEAPON_LABEL[wt]}
          </Chip>
        ))}
        <Chip active={onlyOverridden} onClick={() => setOnlyOverridden((v) => !v)}>
          Đã tùy chỉnh ({Object.keys(costRules.weaponOverrides).length})
        </Chip>
      </div>

      <div className="max-h-[26rem] overflow-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-panel-2 text-muted">
            <tr>
              <th className="px-3 py-2">Vũ khí</th>
              {REFINEMENTS.map((r) => (
                <th key={r} className="px-1.5 py-2 text-center">
                  R{r}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {filtered.map((w) => {
              const defaults =
                w.rarity === 5
                  ? costRules.defaultWeapon5Costs
                  : w.rarity === 4
                    ? costRules.defaultWeapon4Costs
                    : costRules.defaultWeapon3Costs
              const isOverridden = w.slug in costRules.weaponOverrides
              const values = costRules.weaponOverrides[w.slug] ?? defaults

              return (
                <tr key={w.slug} className={isOverridden ? 'bg-gold/5' : undefined}>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <img src={w.icon} alt="" className="size-7 rounded bg-bg/60 object-contain" loading="lazy" />
                      <span className="font-medium text-text">{w.name}</span>
                      <span className="text-muted">
                        {w.rarity}★ · {WEAPON_LABEL[w.weaponType]}
                      </span>
                    </div>
                  </td>
                  {REFINEMENTS.map((r, rIdx) => (
                    <td key={r} className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={values[rIdx] ?? 0}
                        onChange={(e) =>
                          updateCell(w.slug, defaults, rIdx, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="h-7 w-14 rounded border border-line bg-bg/70 px-1 text-center font-mono text-xs text-text focus:border-gold focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    {isOverridden ? (
                      <Button size="sm" variant="ghost" onClick={() => clearOverride(w.slug)}>
                        Mặc định
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted/60">Mặc định</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
