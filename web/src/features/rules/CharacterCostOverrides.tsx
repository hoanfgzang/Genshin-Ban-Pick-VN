import { Fragment, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { toast } from '@/components/ui/toast'
import { ELEMENT_LABEL, type Rarity } from '@/domain/character'
import { COST_CHARACTERS } from '@/domain/characters'
import { isTravelerElementSlug } from '@/domain/traveler'
import type { CharacterCustomCost, CostRules } from '@/domain/ruleset'
import {
  downloadCsvFile,
  exportCharacterCostCsv,
  parseCharacterCostCsv,
  slugifyFilePart,
  type CharacterCsvParseStats,
} from './costCsv'
import {
  COST_ELEMENT_ORDER,
  filterAndSortCharacters,
  type CharCostSortKey,
  type ElementFilterValue,
} from './costTableUtils'

interface Props {
  costRules: CostRules
  rulesetName?: string
  onChange: (next: CostRules) => void
}

const CONSTELLATIONS = [0, 1, 2, 3, 4, 5, 6] as const

const SORT_OPTIONS: ReadonlyArray<{ value: CharCostSortKey; label: string }> = [
  { value: 'default', label: 'Mặc định' },
  { value: 'name_asc', label: 'Tên A → Z' },
  { value: 'name_desc', label: 'Tên Z → A' },
  { value: 'element', label: 'Theo hệ (Hỏa → Nham)' },
]

function nextCustomCostId(existing: readonly CharacterCustomCost[]): string {
  const used = new Set(existing.map((item) => item.id))
  let idx = existing.length + 1
  while (used.has(`cc-${idx}`)) idx += 1
  return `cc-${idx}`
}

export function CharacterCostOverrides({ costRules, rulesetName = 'bo-luat', onChange }: Props) {
  const [query, setQuery] = useState('')
  const [elements, setElements] = useState<ElementFilterValue[]>([])
  const [rarity, setRarity] = useState<Rarity | null>(null)
  const [onlyOverridden, setOnlyOverridden] = useState(false)
  const [onlyCustom, setOnlyCustom] = useState(false)
  const [sort, setSort] = useState<CharCostSortKey>('default')

  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingCsv, setPendingCsv] = useState<{
    nextOverrides: Record<string, number[]>
    nextCustomCosts: Record<string, CharacterCustomCost[]>
    stats: CharacterCsvParseStats
  } | null>(null)

  const customMap = useMemo(
    () => costRules.characterCustomCosts ?? {},
    [costRules.characterCustomCosts],
  )

  const customTotalCount = useMemo(
    () => Object.values(customMap).reduce((sum, list) => sum + list.length, 0),
    [customMap],
  )

  const overriddenTotalCount = useMemo(
    () =>
      COST_CHARACTERS.filter(
        (c) => c.slug in costRules.characterOverrides || (customMap[c.slug]?.length ?? 0) > 0,
      ).length,
    [costRules.characterOverrides, customMap],
  )

  const filtered = useMemo(
    () =>
      filterAndSortCharacters(COST_CHARACTERS, costRules, {
        query,
        elements,
        rarity,
        onlyOverridden,
        onlyCustom,
        sort,
      }),
    [query, elements, rarity, onlyOverridden, onlyCustom, sort, costRules],
  )

  const toggleElement = (el: ElementFilterValue) => {
    setElements((prev) => (prev.includes(el) ? prev.filter((x) => x !== el) : [...prev, el]))
  }

  const hasFilter = Boolean(query.trim() || elements.length > 0 || rarity || onlyOverridden || onlyCustom)

  const clearFilters = () => {
    setQuery('')
    setElements([])
    setRarity(null)
    setOnlyOverridden(false)
    setOnlyCustom(false)
  }

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

  const addCustomCost = (slug: string, baseValues: readonly number[]) => {
    const existing = customMap[slug] ?? []
    const nextItem: CharacterCustomCost = {
      id: nextCustomCostId(existing),
      costs: baseValues.slice(0, 7).map((v) => Math.max(0, v)),
      note: '',
    }
    onChange({
      ...costRules,
      characterCustomCosts: {
        ...customMap,
        [slug]: [...existing, nextItem],
      },
    })
  }

  const updateCustomCostNote = (slug: string, id: string, note: string) => {
    const existing = customMap[slug] ?? []
    onChange({
      ...costRules,
      characterCustomCosts: {
        ...customMap,
        [slug]: existing.map((item) => (item.id === id ? { ...item, note } : item)),
      },
    })
  }

  const updateCustomCostCell = (slug: string, id: string, cIdx: number, val: number) => {
    const existing = customMap[slug] ?? []
    onChange({
      ...costRules,
      characterCustomCosts: {
        ...customMap,
        [slug]: existing.map((item) =>
          item.id === id
            ? { ...item, costs: item.costs.map((old, i) => (i === cIdx ? val : old)) }
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
      characterCustomCosts: nextMap,
    })
  }

  const handleExportCsv = () => {
    const csv = exportCharacterCostCsv(filtered.length > 0 ? filtered : COST_CHARACTERS, costRules)
    downloadCsvFile(`cost-nhan-vat-${slugifyFilePart(rulesetName)}.csv`, csv)
    toast.success(
      `Đã xuất CSV (${filtered.length > 0 ? filtered.length : COST_CHARACTERS.length} nhân vật).`,
    )
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    if (fileRef.current) fileRef.current.value = ''
    const result = parseCharacterCostCsv(text, costRules)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setPendingCsv({
      nextOverrides: result.nextOverrides,
      nextCustomCosts: result.nextCustomCosts,
      stats: result.stats,
    })
  }

  const applyPendingCsv = () => {
    if (!pendingCsv) return
    onChange({
      ...costRules,
      characterOverrides: pendingCsv.nextOverrides,
      characterCustomCosts: pendingCsv.nextCustomCosts,
    })
    setPendingCsv(null)
    toast.success('Đã nhập bảng Cost Nhân vật từ CSV.')
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
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span>Sắp xếp</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CharCostSortKey)}
            className="h-9 cursor-pointer rounded-lg border border-line bg-bg/60 px-2.5 text-xs text-text focus:border-gold focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <Chip active={rarity === 5} onClick={() => setRarity((r) => (r === 5 ? null : 5))}>
          5★
        </Chip>
        <Chip active={rarity === 4} onClick={() => setRarity((r) => (r === 4 ? null : 4))}>
          4★
        </Chip>
        <Chip active={onlyOverridden} onClick={() => setOnlyOverridden((v) => !v)}>
          Đã tùy chỉnh ({overriddenTotalCount})
        </Chip>
        <Chip active={onlyCustom} onClick={() => setOnlyCustom((v) => !v)}>
          Có Custom Cost ({customTotalCount})
        </Chip>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
            aria-label="Chọn file CSV Cost nhân vật"
            onChange={(e) => void handleImportFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo hệ">
        <span className="mr-1 text-xs text-muted">Hệ:</span>
        {COST_ELEMENT_ORDER.map((el) => (
          <Chip key={el} active={elements.includes(el)} onClick={() => toggleElement(el)}>
            <ElementIcon element={el} className="size-3.5" />
            {ELEMENT_LABEL[el]}
          </Chip>
        ))}
        <Chip active={elements.includes('none')} onClick={() => toggleElement('none')}>
          Khác
        </Chip>
        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 cursor-pointer text-xs font-medium text-gold underline-offset-2 hover:underline"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        Nhập Cost C0–C6 (hỗ trợ số lẻ 0.5). Bấm <strong className="text-text">+ Custom</strong> để thêm mức
        Custom Cost kèm ghi chú điều kiện kích hoạt cho từng trường hợp đặc biệt.
      </p>

      <div className="max-h-[30rem] overflow-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-panel-2 text-muted">
            <tr>
              <th className="px-3 py-2">Nhân vật ({filtered.length})</th>
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
              const customItems = customMap[c.slug] ?? []

              return (
                <Fragment key={c.slug}>
                  <tr className={isOverridden || customItems.length > 0 ? 'bg-gold/5' : undefined}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <img src={c.icon} alt="" className="size-7 rounded object-cover" loading="lazy" />
                        {c.element && <ElementIcon element={c.element} className="size-3.5 shrink-0" />}
                        <span className="font-medium text-text">{c.name}</span>
                        <span className="text-muted">{c.rarity}★</span>
                        {isTravelerElementSlug(c.slug) && (
                          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold-strong">
                            Nam / Nữ
                          </span>
                        )}
                        {customItems.length > 0 && (
                          <span className="rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-bold text-hydro">
                            {customItems.length} ĐK
                          </span>
                        )}
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => addCustomCost(c.slug, values)}
                          title="Thêm mức Custom Cost kèm ghi chú điều kiện"
                        >
                          + Custom
                        </Button>
                        {isOverridden ? (
                          <Button size="sm" variant="ghost" onClick={() => clearOverride(c.slug)}>
                            Mặc định
                          </Button>
                        ) : (
                          <span className="px-1 text-[11px] text-muted/60">Mặc định</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {customItems.map((cc) => (
                    <tr key={`${c.slug}-${cc.id}`} className="bg-hydro/5">
                      <td className="py-1.5 pr-2 pl-8">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-hydro">
                            ↳ Điều kiện đặc biệt ({c.name})
                          </span>
                          <input
                            type="text"
                            value={cc.note}
                            maxLength={300}
                            onChange={(e) => updateCustomCostNote(c.slug, cc.id, e.target.value)}
                            placeholder="Nhập ghi chú điều kiện kích hoạt (bắt buộc)…"
                            className="h-7 w-full min-w-52 rounded border border-hydro/40 bg-bg/80 px-2 text-xs text-text placeholder:text-muted/70 focus:border-gold focus:outline-none"
                          />
                        </div>
                      </td>
                      {CONSTELLATIONS.map((lvl) => (
                        <td key={lvl} className="px-1 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={cc.costs[lvl] ?? 0}
                            onChange={(e) =>
                              updateCustomCostCell(
                                c.slug,
                                cc.id,
                                lvl,
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                            className="h-7 w-14 rounded border border-hydro/40 bg-bg/80 px-1 text-center font-mono text-xs text-gold-strong focus:border-gold focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right">
                        <Button size="sm" variant="danger" onClick={() => removeCustomCost(c.slug, cc.id)}>
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
                <td colSpan={9} className="py-8 text-center text-muted">
                  Không có nhân vật nào khớp bộ lọc hiện tại.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(pendingCsv)}
        onOpenChange={(o) => !o && setPendingCsv(null)}
        title="Xác nhận nhập Cost Nhân vật từ CSV"
        description="Các nhân vật có mặt trong file CSV sẽ cập nhật bảng Cost và danh sách Custom Cost tương ứng."
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
              Nhân vật khớp được: <strong>{pendingCsv.stats.matchedCharacters}</strong>
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
