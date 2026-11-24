import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ElementIcon } from '@/components/ui/ElementIcon'
import type { Rarity } from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import type { CostRules } from '@/domain/ruleset'

interface Props {
  costRules: CostRules
  onChange: (next: CostRules) => void
}

const CONSTELLATIONS = [0, 1, 2, 3, 4, 5, 6] as const

export function CharacterCostOverrides({ costRules, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<Rarity | null>(null)
  const [onlyOverridden, setOnlyOverridden] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CHARACTERS.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.slug.includes(q)) return false
      if (rarity && c.rarity !== rarity) return false
      if (onlyOverridden && !(c.slug in costRules.characterOverrides)) return false
      return true
    })
  }, [query, rarity, onlyOverridden, costRules.characterOverrides])

  const updateCell = (slug: string, baseDefaults: number[], cIdx: number, val: number) => {
    const current = costRules.characterOverrides[slug] ?? [...baseDefaults]
    const updated = current.map((old, i) => (i === cIdx ? val : old))
    onChange({
      ...costRules,
      characterOverrides: {
        ...costRules.characterOverrides,
        [slug]: updated,
      },
    })
  }

  const clearOverride = (slug: string) => {
    const next = { ...costRules.characterOverrides }
    delete next[slug]
    onChange({ ...costRules, characterOverrides: next })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm nhân vật (4★ hoặc 5★)…"
          className="h-9 w-full max-w-xs rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
        />
        <Chip active={rarity === 5} onClick={() => setRarity((r) => (r === 5 ? null : 5))}>
          5★
        </Chip>
        <Chip active={rarity === 4} onClick={() => setRarity((r) => (r === 4 ? null : 4))}>
          4★
        </Chip>
        <Chip active={onlyOverridden} onClick={() => setOnlyOverridden((v) => !v)}>
          Đã tùy chỉnh ({Object.keys(costRules.characterOverrides).length})
        </Chip>
      </div>

      <p className="text-xs text-muted">
        Nhập số Cost riêng cho từng cung mệnh C0–C6 (có thể đặt Cost cho nhân vật 4★ hoặc chỉnh số lẻ 0.5).
      </p>

      <div className="max-h-[26rem] overflow-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-panel-2 text-muted">
            <tr>
              <th className="px-3 py-2">Nhân vật</th>
              {CONSTELLATIONS.map((c) => (
                <th key={c} className="px-1.5 py-2 text-center">
                  C{c}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {filtered.map((c) => {
              const defaults = c.rarity === 5 ? costRules.defaultChar5Costs : costRules.defaultChar4Costs
              const isOverridden = c.slug in costRules.characterOverrides
              const values = costRules.characterOverrides[c.slug] ?? defaults

              return (
                <tr key={c.slug} className={isOverridden ? 'bg-gold/5' : undefined}>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <img src={c.icon} alt="" className="size-7 rounded object-cover" loading="lazy" />
                      {c.element && <ElementIcon element={c.element} className="size-3.5 shrink-0" />}
                      <span className="font-medium text-text">{c.name}</span>
                      <span className="text-muted">{c.rarity}★</span>
                    </div>
                  </td>
                  {CONSTELLATIONS.map((lvl) => (
                    <td key={lvl} className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={values[lvl] ?? 0}
                        onChange={(e) =>
                          updateCell(c.slug, defaults, lvl, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="h-7 w-14 rounded border border-line bg-bg/70 px-1 text-center font-mono text-xs text-text focus:border-gold focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    {isOverridden ? (
                      <Button size="sm" variant="ghost" onClick={() => clearOverride(c.slug)}>
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
