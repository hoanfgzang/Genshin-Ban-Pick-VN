import { useMemo, useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { WEAPON_LABEL, type Character } from '@/domain/character'
import {
  calcCharacterCost,
  calcWeaponCost,
  calcWeaponRefinementSeconds,
  formatCost,
  formatSeconds,
  getCharacterCustomCosts,
  getWeaponCustomCosts,
} from '@/domain/cost'
import type { CostRules } from '@/domain/ruleset'
import { REFINEMENTS, type Refinement, type WeaponRarity } from '@/domain/weapon'
import { getWeaponsForType } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot } from '@/services'

interface Props {
  open: boolean
  character: Character | null
  pick?: MatchPickSlot | null
  costRules: CostRules
  initialWeaponSlug: string | null
  initialRefinement: number
  onSelectCharacterCustomCost?: (customCostId: string | null) => void
  onSelect: (weaponSlug: string, refinement: Refinement, weaponCustomCostId: string | null) => void
  onClose: () => void
}

export function WeaponPickerModal({
  open,
  character,
  pick = null,
  costRules,
  initialWeaponSlug,
  initialRefinement,
  onSelectCharacterCustomCost,
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

  const charCustomList = getCharacterCustomCosts(character.slug, costRules)
  const baseCharCost = pick
    ? calcCharacterCost(character.slug, pick.constellation, costRules, null)
    : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Chọn vũ khí & Điều kiện Cost cho ${character.name}`}
      description={`Loại vũ khí: ${WEAPON_LABEL[character.weapon]} · Chọn tinh luyện R1–R5 rồi bấm vào vũ khí (hoặc điều kiện đặc biệt nếu có).`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        {pick && charCustomList.length > 0 && onSelectCharacterCustomCost && (
          <div className="rounded-xl border border-hydro/40 bg-hydro/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-hydro">
                Điều kiện Cost Nhân vật ({character.name} · C{pick.constellation})
              </span>
              <span className="text-[11px] text-muted">
                Đang tính: <strong className="text-gold-strong">{formatCost(pick.characterCost)} cost</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectCharacterCustomCost(null)}
                className={cn(
                  'cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-xs transition',
                  !pick.characterCustomCostId
                    ? 'border-gold bg-gold/20 font-semibold text-gold-strong'
                    : 'border-line bg-bg/60 text-muted hover:border-gold/50 hover:text-text',
                )}
              >
                Mặc định ({formatCost(baseCharCost)} cost)
              </button>
              {charCustomList.map((cc) => {
                const ccVal = calcCharacterCost(character.slug, pick.constellation, costRules, cc.id)
                const active = pick.characterCustomCostId === cc.id
                return (
                  <button
                    key={cc.id}
                    type="button"
                    onClick={() => onSelectCharacterCustomCost(active ? null : cc.id)}
                    className={cn(
                      'cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-xs transition',
                      active
                        ? 'border-hydro bg-hydro/20 font-semibold text-text ring-1 ring-hydro'
                        : 'border-line bg-bg/60 text-text hover:border-hydro/60',
                    )}
                  >
                    <span className="font-mono font-bold text-gold-strong">{formatCost(ccVal)} cost</span>
                    <span className="mx-1 text-muted">·</span>
                    <span>{cc.note}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
            {([5, 4] as const).map((r) => (
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

        <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((w) => {
            const cost = calcWeaponCost(w.slug, costRules)
            const refSec = calcWeaponRefinementSeconds(w.slug, refinement, costRules)
            const wCustomList = getWeaponCustomCosts(w.slug, costRules)
            const isSelectedBase = initialWeaponSlug === w.slug && !pick?.weaponCustomCostId
            const isSelectedAny = initialWeaponSlug === w.slug

            return (
              <div
                key={w.slug}
                className={cn(
                  'flex flex-col overflow-hidden rounded-lg border transition',
                  isSelectedAny
                    ? 'border-gold bg-gold/10'
                    : 'border-line bg-bg/50 hover:border-gold/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(w.slug, refinement, null)
                    onClose()
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 p-2 text-left transition hover:bg-panel-2',
                    isSelectedBase && 'bg-gold/15',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br p-0.5',
                      w.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
                    )}
                  >
                    <img src={w.icon} alt="" className="size-full object-contain" loading="lazy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-text">{w.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="text-muted">
                        {w.rarity}★ · R{refinement}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={cost > 0 ? 'font-bold text-gold-strong' : 'text-muted'}>
                          +{formatCost(cost)} cost
                        </span>
                        {refSec > 0 && (
                          <span className="rounded bg-pyro/20 px-1 font-bold text-pyro">
                            +{formatSeconds(refSec)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {wCustomList.length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-line/60 bg-hydro/5 p-1.5">
                    {wCustomList.map((wc) => {
                      const wcRefSec = calcWeaponRefinementSeconds(
                        w.slug,
                        refinement,
                        costRules,
                        wc.id,
                      )
                      const isSelectedCustom =
                        initialWeaponSlug === w.slug && pick?.weaponCustomCostId === wc.id
                      return (
                        <button
                          key={wc.id}
                          type="button"
                          onClick={() => {
                            onSelect(w.slug, refinement, wc.id)
                            onClose()
                          }}
                          className={cn(
                            'flex cursor-pointer flex-col gap-0.5 rounded border px-2 py-1 text-left text-[11px] transition',
                            isSelectedCustom
                              ? 'border-hydro bg-hydro/20 font-semibold text-text'
                              : 'border-hydro/30 bg-bg/60 text-text hover:border-hydro',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-hydro">ĐK đặc biệt</span>
                            <span className="font-mono font-bold text-gold-strong">
                              +{formatCost(wc.cost)} cost
                              {wcRefSec > 0 ? ` · +${formatSeconds(wcRefSec)}` : ''}
                            </span>
                          </div>
                          <span className="line-clamp-2 text-[10px] text-muted">{wc.note}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
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
