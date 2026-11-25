import { Fragment, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'
import { WEAPON_LABEL, WEAPONS, type WeaponType } from '@/domain/character'
import type { CostRules, WeaponCustomCost } from '@/domain/ruleset'
import { REFINEMENTS, type WeaponRarity } from '@/domain/weapon'
import { WEAPONS_LIST } from '@/domain/weapons'
import {
  downloadCsvFile,
  exportWeaponCostCsv,
  parseWeaponCostCsv,
  slugifyFilePart,
  type WeaponCsvParseStats,
} from './costCsv'
import { filterAndSortWeapons, type WeaponCostSortKey } from './costTableUtils'

interface Props {
  costRules: CostRules
  rulesetName?: string
  onChange: (next: CostRules) => void
}

const SORT_OPTIONS: ReadonlyArray<{ value: WeaponCostSortKey; label: string }> = [
  { value: 'default', label: 'Mặc định' },
  { value: 'name_asc', label: 'Tên A → Z' },
  { value: 'name_desc', label: 'Tên Z → A' },
  { value: 'rarity', label: 'Độ hiếm (5★ → 4★)' },
  { value: 'weaponType', label: 'Loại vũ khí' },
]

function nextWeaponCustomId(existing: readonly WeaponCustomCost[]): string {
  const used = new Set(existing.map((item) => item.id))
  let idx = existing.length + 1
  while (used.has(`wc-${idx}`)) idx += 1
  return `wc-${idx}`
}

export function WeaponCostOverrides({ costRules, rulesetName = 'bo-luat', onChange }: Props) {
  const [query, setQuery] = useState('')
  const [weaponType, setWeaponType] = useState<WeaponType | null>(null)
  const [rarity, setRarity] = useState<WeaponRarity | null>(null)
  const [onlyOverridden, setOnlyOverridden] = useState(false)
  const [onlyCustom, setOnlyCustom] = useState(false)
  const [sort, setSort] = useState<WeaponCostSortKey>('default')

  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingCsv, setPendingCsv] = useState<{
    nextCostOverrides: Record<string, number>
    nextRefOverrides: Record<string, number[]>
    nextCustomCosts: Record<string, WeaponCustomCost[]>
    stats: WeaponCsvParseStats
  } | null>(null)

  const customMap = useMemo(
    () => costRules.weaponCustomCosts ?? {},
    [costRules.weaponCustomCosts],
  )

  const customTotalCount = useMemo(
    () => Object.values(customMap).reduce((sum, list) => sum + list.length, 0),
    [customMap],
  )

  const overriddenCount = useMemo(
    () =>
      WEAPONS_LIST.filter(
        (w) =>
          w.slug in costRules.weaponCostOverrides ||
          w.slug in costRules.weaponRefinementOverrides ||
          (customMap[w.slug]?.length ?? 0) > 0,
      ).length,
    [costRules.weaponCostOverrides, costRules.weaponRefinementOverrides, customMap],
  )

  const filtered = useMemo(
    () =>
      filterAndSortWeapons(WEAPONS_LIST, costRules, {
        query,
        weaponType,
        rarity,
        onlyOverridden,
        onlyCustom,
        sort,
      }),
    [query, weaponType, rarity, onlyOverridden, onlyCustom, sort, costRules],
  )

  const hasFilter = Boolean(query.trim() || weaponType || rarity || onlyOverridden || onlyCustom)

  const clearFilters = () => {
    setQuery('')
    setWeaponType(null)
    setRarity(null)
    setOnlyOverridden(false)
    setOnlyCustom(false)
  }

  const updateBaseCost = (slug: string, val: number) => {
    onChange({
      ...costRules,
      weaponCostOverrides: {
        ...costRules.weaponCostOverrides,
        [slug]: val,
      },
    })
  }

  const updateRefinementCell = (slug: string, baseDefaults: number[], rIdx: number, val: number) => {
    const current = costRules.weaponRefinementOverrides[slug] ?? [...baseDefaults]
    const updated = current.map((old, i) => (i === rIdx ? val : old))
    onChange({
      ...costRules,
      weaponRefinementOverrides: {
        ...costRules.weaponRefinementOverrides,
        [slug]: updated,
      },
    })
  }

  const clearOverride = (slug: string) => {
    const nextCost = { ...costRules.weaponCostOverrides }
    const nextRef = { ...costRules.weaponRefinementOverrides }
    delete nextCost[slug]
    delete nextRef[slug]
    onChange({
      ...costRules,
      weaponCostOverrides: nextCost,
      weaponRefinementOverrides: nextRef,
    })
  }

  const addCustomCost = (slug: string, baseCost: number, baseRef: readonly number[]) => {
    const existing = customMap[slug] ?? []
    const nextItem: WeaponCustomCost = {
      id: nextWeaponCustomId(existing),
      cost: Math.max(0, baseCost),
      refinementSeconds: baseRef.slice(0, 5).map((v) => Math.max(0, v)),
      note: '',
    }
    onChange({
      ...costRules,
      weaponCustomCosts: {
        ...customMap,
        [slug]: [...existing, nextItem],
      },
    })
  }

  const updateCustomNote = (slug: string, id: string, note: string) => {
    const existing = customMap[slug] ?? []
    onChange({
      ...costRules,
      weaponCustomCosts: {
        ...customMap,
        [slug]: existing.map((item) => (item.id === id ? { ...item, note } : item)),
      },
    })
  }

  const updateCustomCostValue = (slug: string, id: string, cost: number) => {
    const existing = customMap[slug] ?? []
    onChange({
      ...costRules,
      weaponCustomCosts: {
        ...customMap,
        [slug]: existing.map((item) => (item.id === id ? { ...item, cost } : item)),
      },
    })
  }

  const updateCustomRefCell = (slug: string, id: string, rIdx: number, val: number) => {
    const existing = customMap[slug] ?? []
    onChange({
      ...costRules,
      weaponCustomCosts: {
        ...customMap,
        [slug]: existing.map((item) =>
          item.id === id
            ? {
                ...item,
                refinementSeconds: item.refinementSeconds.map((old, i) => (i === rIdx ? val : old)),
              }
            : item,
        ),
      },
    })
  }

  const removeCustomCost = (slug: string, id: string) => {
    const existing = customMap[slug] ?? []
    const remaining = existing.filter((item) => item.id !== id)
    const nextMap = { ...customMap }
    if (remaining.length > 0) {
      nextMap[slug] = remaining
    } else {
      delete nextMap[slug]
    }
    onChange({
      ...costRules,
      weaponCustomCosts: nextMap,
    })
  }

  const handleExportCsv = () => {
    const csv = exportWeaponCostCsv(filtered.length > 0 ? filtered : WEAPONS_LIST, costRules)
    downloadCsvFile(`cost-vu-khi-${slugifyFilePart(rulesetName)}.csv`, csv)
    toast.success(`Đã xuất CSV (${filtered.length > 0 ? filtered.length : WEAPONS_LIST.length} vũ khí).`)
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    if (fileRef.current) fileRef.current.value = ''
    const result = parseWeaponCostCsv(text, costRules)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setPendingCsv({
      nextCostOverrides: result.nextCostOverrides,
      nextRefOverrides: result.nextRefOverrides,
      nextCustomCosts: result.nextCustomCosts,
      stats: result.stats,
    })
  }

  const applyPendingCsv = () => {
    if (!pendingCsv) return
    onChange({
      ...costRules,
      weaponCostOverrides: pendingCsv.nextCostOverrides,
      weaponRefinementOverrides: pendingCsv.nextRefOverrides,
      weaponCustomCosts: pendingCsv.nextCustomCosts,
    })
    setPendingCsv(null)
    toast.success('Đã nhập bảng Cost Vũ khí từ CSV.')
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
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span>Sắp xếp</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as WeaponCostSortKey)}
            className="h-9 cursor-pointer rounded-lg border border-line bg-bg/60 px-2.5 text-xs text-text focus:border-gold focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {([5, 4] as const).map((r) => (
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
          Đã tùy chỉnh ({overriddenCount})
        </Chip>
        <Chip active={onlyCustom} onClick={() => setOnlyCustom((v) => !v)}>
          Có Custom Cost ({customTotalCount})
        </Chip>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="cursor-pointer text-xs font-medium text-gold underline-offset-2 hover:underline"
            >
              Xóa bộ lọc
            </button>
          )}
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            Nhập CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={handleExportCsv}>
            Xuất CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Chọn file CSV Cost vũ khí"
            onChange={(e) => void handleImportFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        Chỉnh Cost cơ bản hoặc thời gian cộng thêm (giây) R1–R5. Bấm <strong className="text-text">+ Custom</strong> để thêm mức Custom Cost kèm ghi chú điều kiện kích hoạt.
      </p>

      <div className="max-h-[30rem] overflow-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-panel-2 text-muted">
            <tr>
              <th className="px-3 py-2">Vũ khí ({filtered.length})</th>
              <th className="px-1.5 py-2 text-center">Cost</th>
              {REFINEMENTS.map((r) => (
                <th key={r} className="px-1.5 py-2 text-center">
                  R{r} (s)
                </th>
              ))}
              <th className="px-2 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {filtered.map((w) => {
              const defaultCost =
                w.rarity === 5 ? costRules.defaultWeapon5Cost : costRules.defaultWeapon4Cost
              const defaultRef =
                w.rarity === 5
                  ? costRules.defaultWeapon5RefinementSeconds
                  : costRules.defaultWeapon4RefinementSeconds
              const hasCostOverride = w.slug in costRules.weaponCostOverrides
              const hasRefOverride = w.slug in costRules.weaponRefinementOverrides
              const customItems = customMap[w.slug] ?? []
              const isBaseOverridden = hasCostOverride || hasRefOverride
              const costValue = costRules.weaponCostOverrides[w.slug] ?? defaultCost
              const refValues = costRules.weaponRefinementOverrides[w.slug] ?? defaultRef

              return (
                <Fragment key={w.slug}>
                  <tr className={isBaseOverridden || customItems.length > 0 ? 'bg-gold/5' : undefined}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <img src={w.icon} alt="" className="size-7 rounded bg-bg/60 object-contain" loading="lazy" />
                        <span className="font-medium text-text">{w.name}</span>
                        <span className="text-muted">
                          {w.rarity}★ · {WEAPON_LABEL[w.weaponType]}
                        </span>
                        {customItems.length > 0 && (
                          <span className="rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-bold text-hydro">
                            {customItems.length} ĐK
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={costValue}
                        onChange={(e) =>
                          updateBaseCost(w.slug, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="h-7 w-14 rounded border border-gold/40 bg-bg/70 px-1 text-center font-mono text-xs text-gold-strong focus:border-gold focus:outline-none"
                      />
                    </td>
                    {REFINEMENTS.map((r, rIdx) => (
                      <td key={r} className="px-1 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={refValues[rIdx] ?? 0}
                          onChange={(e) =>
                            updateRefinementCell(
                              w.slug,
                              defaultRef,
                              rIdx,
                              Math.max(0, Number(e.target.value) || 0),
                            )
                          }
                          className="h-7 w-14 rounded border border-line bg-bg/70 px-1 text-center font-mono text-xs text-text focus:border-gold focus:outline-none"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => addCustomCost(w.slug, costValue, refValues)}
                          title="Thêm mức Custom Cost kèm ghi chú điều kiện"
                        >
                          + Custom
                        </Button>
                        {isBaseOverridden ? (
                          <Button size="sm" variant="ghost" onClick={() => clearOverride(w.slug)}>
                            Mặc định
                          </Button>
                        ) : (
                          <span className="px-1 text-[11px] text-muted/60">Mặc định</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {customItems.map((wc) => (
                    <tr key={`${w.slug}-${wc.id}`} className="bg-hydro/5">
                      <td className="py-1.5 pr-2 pl-8">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-hydro">
                            ↳ Điều kiện đặc biệt ({w.name})
                          </span>
                          <input
                            type="text"
                            value={wc.note}
                            maxLength={300}
                            onChange={(e) => updateCustomNote(w.slug, wc.id, e.target.value)}
                            placeholder="Nhập ghi chú điều kiện kích hoạt (bắt buộc)…"
                            className="h-7 w-full min-w-52 rounded border border-hydro/40 bg-bg/80 px-2 text-xs text-text placeholder:text-muted/70 focus:border-gold focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={wc.cost}
                          onChange={(e) =>
                            updateCustomCostValue(
                              w.slug,
                              wc.id,
                              Math.max(0, Number(e.target.value) || 0),
                            )
                          }
                          className="h-7 w-14 rounded border border-hydro/40 bg-bg/80 px-1 text-center font-mono text-xs text-gold-strong focus:border-gold focus:outline-none"
                        />
                      </td>
                      {REFINEMENTS.map((r, rIdx) => (
                        <td key={r} className="px-1 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={wc.refinementSeconds[rIdx] ?? 0}
                            onChange={(e) =>
                              updateCustomRefCell(
                                w.slug,
                                wc.id,
                                rIdx,
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                            className="h-7 w-14 rounded border border-hydro/40 bg-bg/80 px-1 text-center font-mono text-xs text-pyro focus:border-gold focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right">
                        <Button size="sm" variant="danger" onClick={() => removeCustomCost(w.slug, wc.id)}>
                          Xóa
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  Không có vũ khí nào khớp bộ lọc hiện tại.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(pendingCsv)}
        onOpenChange={(o) => !o && setPendingCsv(null)}
        title="Xác nhận nhập Cost Vũ khí từ CSV"
        description="Các vũ khí có mặt trong file CSV sẽ cập nhật Cost, thời gian tinh luyện và Custom Cost tương ứng."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingCsv(null)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={applyPendingCsv}>
              Áp dụng CSV
            </Button>
          </>
        }
      >
        {pendingCsv && (
          <ul className="space-y-1.5 text-sm">
            <li>
              Vũ khí khớp được: <strong>{pendingCsv.stats.matchedWeapons}</strong>
            </li>
            <li className="text-gold-strong">
              ~ Thay đổi / Tùy chỉnh mới: {pendingCsv.stats.overriddenCount}
            </li>
            <li className="text-muted">
              ↺ Trở về mặc định: {pendingCsv.stats.resetToDefaultCount}
            </li>
            <li className="text-hydro">
              ★ Tổng dòng Custom Cost (điều kiện đặc biệt): {pendingCsv.stats.customEntries}
            </li>
            {pendingCsv.stats.unknownRows.length > 0 && (
              <li className="text-danger">
                Bỏ qua {pendingCsv.stats.unknownRows.length} dòng không nhận diện được (
                {pendingCsv.stats.unknownRows.slice(0, 5).join(', ')}
                {pendingCsv.stats.unknownRows.length > 5 ? '…' : ''}).
              </li>
            )}
          </ul>
        )}
      </Dialog>
    </div>
  )
}
