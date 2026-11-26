import * as Tabs from '@radix-ui/react-tabs'
import { Fragment, useMemo, useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { ELEMENT_LABEL, WEAPON_LABEL, type Rarity, type WeaponType, WEAPONS } from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import {
  calcCharacterCost,
  calcCostPenaltySeconds,
  calcWeaponCost,
  calcWeaponRefinementSeconds,
  formatCost,
  formatSeconds,
} from '@/domain/cost'
import { getStepBaseSeconds, TIE_BREAK_OPTIONS, type RuleSet } from '@/domain/ruleset'
import { REFINEMENTS, type WeaponRarity } from '@/domain/weapon'
import { WEAPONS_LIST } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import {
  COST_ELEMENT_ORDER,
  filterAndSortCharacters,
  filterAndSortWeapons,
  type CharCostSortKey,
  type ElementFilterValue,
  type WeaponCostSortKey,
} from './costTableUtils'

interface Props {
  ruleset: RuleSet
}

const CONSTELLATIONS = [0, 1, 2, 3, 4, 5, 6] as const

export function RuleSetViewer({ ruleset }: Props) {
  const { config } = ruleset
  const { costRules } = config
  const [sampleCost, setSampleCost] = useState('8')
  const [charQuery, setCharQuery] = useState('')
  const [charElements, setCharElements] = useState<ElementFilterValue[]>([])
  const [charRarity, setCharRarity] = useState<Rarity | null>(null)
  const [onlyCharOverrides, setOnlyCharOverrides] = useState(false)
  const [onlyCharCustom, setOnlyCharCustom] = useState(false)
  const [charSort, setCharSort] = useState<CharCostSortKey>('default')

  const [weaponQuery, setWeaponQuery] = useState('')
  const [weaponTypeFilter, setWeaponTypeFilter] = useState<WeaponType | null>(null)
  const [weaponRarityFilter, setWeaponRarityFilter] = useState<WeaponRarity | null>(null)
  const [onlyWeaponOverrides, setOnlyWeaponOverrides] = useState(false)
  const [onlyWeaponCustom, setOnlyWeaponCustom] = useState(false)
  const [weaponSort, setWeaponSort] = useState<WeaponCostSortKey>('default')

  const blueBans = config.draftSteps.filter((s) => s.side === 'blue' && s.action === 'ban').length
  const bluePicks = config.draftSteps.filter((s) => s.side === 'blue' && s.action === 'pick').length
  const redBans = config.draftSteps.filter((s) => s.side === 'red' && s.action === 'ban').length
  const redPicks = config.draftSteps.filter((s) => s.side === 'red' && s.action === 'pick').length
  const tieBreak =
    TIE_BREAK_OPTIONS.find((o) => o.value === (config.tieBreakRule ?? 'none')) ??
    TIE_BREAK_OPTIONS[0]

  const parsedSampleCost = Number.isFinite(Number(sampleCost)) ? Math.max(0, Number(sampleCost)) : 0
  const samplePenalty = calcCostPenaltySeconds(parsedSampleCost, costRules)

  const charCustomMap = useMemo(
    () => costRules.characterCustomCosts ?? {},
    [costRules.characterCustomCosts],
  )
  const weaponCustomMap = useMemo(
    () => costRules.weaponCustomCosts ?? {},
    [costRules.weaponCustomCosts],
  )

  const charCustomCount = useMemo(
    () => Object.values(charCustomMap).reduce((sum, list) => sum + list.length, 0),
    [charCustomMap],
  )
  const charOverriddenCount = useMemo(
    () =>
      CHARACTERS.filter(
        (c) => c.slug in costRules.characterOverrides || (charCustomMap[c.slug]?.length ?? 0) > 0,
      ).length,
    [costRules.characterOverrides, charCustomMap],
  )

  const filteredCharacters = useMemo(
    () =>
      filterAndSortCharacters(CHARACTERS, costRules, {
        query: charQuery,
        elements: charElements,
        rarity: charRarity,
        onlyOverridden: onlyCharOverrides,
        onlyCustom: onlyCharCustom,
        sort: charSort,
      }),
    [charQuery, charElements, charRarity, onlyCharOverrides, onlyCharCustom, charSort, costRules],
  )

  const weaponCustomCount = useMemo(
    () => Object.values(weaponCustomMap).reduce((sum, list) => sum + list.length, 0),
    [weaponCustomMap],
  )

  const overriddenWeaponCount = useMemo(
    () =>
      WEAPONS_LIST.filter(
        (w) =>
          w.slug in costRules.weaponCostOverrides ||
          w.slug in costRules.weaponRefinementOverrides ||
          (weaponCustomMap[w.slug]?.length ?? 0) > 0,
      ).length,
    [costRules.weaponCostOverrides, costRules.weaponRefinementOverrides, weaponCustomMap],
  )

  const filteredWeapons = useMemo(
    () =>
      filterAndSortWeapons(WEAPONS_LIST, costRules, {
        query: weaponQuery,
        weaponType: weaponTypeFilter,
        rarity: weaponRarityFilter,
        onlyOverridden: onlyWeaponOverrides,
        onlyCustom: onlyWeaponCustom,
        sort: weaponSort,
      }),
    [
      weaponQuery,
      weaponTypeFilter,
      weaponRarityFilter,
      onlyWeaponOverrides,
      onlyWeaponCustom,
      weaponSort,
      costRules,
    ],
  )

  const toggleCharElement = (el: ElementFilterValue) => {
    setCharElements((prev) => (prev.includes(el) ? prev.filter((x) => x !== el) : [...prev, el]))
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-gold-strong">{ruleset.name}</h2>
              {ruleset.isDefault && (
                <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold-strong">
                  Mặc định
                </span>
              )}
              {!ruleset.isActive && (
                <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">
                  Đang ẩn
                </span>
              )}
            </div>
            {ruleset.description && (
              <p className="mt-1.5 max-w-3xl text-sm text-muted">{ruleset.description}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
            <StatBox label="Đội Xanh (Trái)" value={`${blueBans} Ban · ${bluePicks} Pick`} cls="text-hydro" />
            <StatBox label="Đội Đỏ (Phải)" value={`${redBans} Ban · ${redPicks} Pick`} cls="text-danger" />
            <StatBox
              label="Ban / Pick / Vũ khí"
              value={`${(config.banSeconds ?? config.perTurnSeconds) || '∞'}s / ${(config.pickSeconds ?? config.perTurnSeconds) || '∞'}s / ${config.weaponPhaseSeconds || '∞'}s`}
            />
            <StatBox
              label="Thời gian gốc"
              value={config.useReserveTime ? `${config.reserveTimeSeconds ?? 120}s / người` : 'Không dùng'}
              cls={config.useReserveTime ? 'text-gold-strong' : 'text-muted'}
            />
            <StatBox
              label="Giới hạn âm xử thua"
              value={
                (config.maxOvertimeSeconds ?? 600) > 0
                  ? `${Math.floor((config.maxOvertimeSeconds ?? 600) / 60)}:${String((config.maxOvertimeSeconds ?? 600) % 60).padStart(2, '0')} (${config.maxOvertimeSeconds ?? 600}s)`
                  : 'Không giới hạn'
              }
              cls={(config.maxOvertimeSeconds ?? 600) > 0 ? 'text-danger' : 'text-muted'}
            />
            <StatBox label="Mốc 3 ải cố định" value="09:00 / ải" cls="text-gold-strong" />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-line/70 bg-bg/40 px-3.5 py-2.5 text-xs">
          <span className="text-muted">Phân định ván hòa: </span>
          <strong className="text-gold-strong">{tieBreak.label}</strong>
          <span className="text-muted"> — {tieBreak.description}</span>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Thứ tự Ban / Pick ({config.draftSteps.length} lượt — Xanh Dương bên trái đi trước)
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {config.draftSteps.map((s) => {
              const stepSec = getStepBaseSeconds(config, s)
              return (
                <span
                  key={s.step}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold',
                    s.side === 'blue'
                      ? 'border-hydro/40 bg-hydro/10 text-hydro'
                      : 'border-danger/40 bg-danger/10 text-danger',
                  )}
                >
                  <span className="opacity-70">#{s.step}</span>
                  <span>{s.side === 'blue' ? 'Xanh' : 'Đỏ'}</span>
                  <span className="rounded bg-black/30 px-1 text-[10px] uppercase">{s.action}</span>
                  <span className="font-mono text-[10px] opacity-80">{stepSec > 0 ? `${stepSec}s` : '∞'}</span>
                </span>
              )
            })}
          </div>
        </div>
      </section>

      <section className="panel grid gap-5 p-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-base font-bold text-text">
            Quy tắc quy đổi Cost & Tinh luyện vũ khí sang Điểm (Giây)
          </h3>
          <p className="mb-3 text-xs text-muted">
            Tổng điểm (giây) của đội = <strong className="text-text">Điểm quy đổi từ Cost</strong> +{' '}
            <strong className="text-text">Thời gian cộng thêm khi tinh luyện vũ khí</strong> +{' '}
            <strong className="text-text">Phạt quá giờ (nếu vượt đồng hồ đếm ngược)</strong> +{' '}
            <strong className="text-text">09:00 − thời gian hoàn thành</strong> của 3 ải. Ai ít điểm nhất người đó thắng.
          </p>
          {costRules.milestones.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Mốc Cost</th>
                    <th className="px-3 py-2">Hệ số nhân Tổng Cost</th>
                    <th className="px-3 py-2">Cộng cố định ở mốc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {costRules.milestones.map((m, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium">
                        {formatCost(m.minCost)} → {m.maxCost === null ? '∞' : formatCost(m.maxCost)}
                      </td>
                      <td className="px-3 py-2 text-gold-strong">Tổng Cost × {formatSeconds(m.secondsPerCost)}</td>
                      <td className="px-3 py-2 text-muted">
                        {m.bonusSeconds > 0 ? `+${formatSeconds(m.bonusSeconds)}` : '0s'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-bg/40 p-3 text-sm">
              Áp dụng hệ số đồng nhất: <strong className="text-gold-strong">+{formatSeconds(costRules.baseSecondsPerCost)}</strong> cho mỗi 1 Cost.
            </div>
          )}
          <div className="mt-3 grid gap-2 rounded-lg border border-line/80 bg-bg/40 p-3 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted">Cost vũ khí mặc định: </span>
              <strong className="text-text">5★ = {formatCost(costRules.defaultWeapon5Cost)}</strong>
              <span className="text-muted"> · </span>
              <strong className="text-text">4★ = {formatCost(costRules.defaultWeapon4Cost)}</strong>
            </div>
            <div>
              <span className="text-muted">Tinh luyện R1–R5: </span>
              <strong className="text-pyro">
                5★ ({costRules.defaultWeapon5RefinementSeconds.map((s) => `+${formatSeconds(s)}`).join(' / ')})
              </strong>
              <span className="text-muted"> · </span>
              <strong className="text-text">
                4★ ({costRules.defaultWeapon4RefinementSeconds.map((s) => `+${formatSeconds(s)}`).join(' / ')})
              </strong>
            </div>
          </div>
          {costRules.draftBonusSecondsPerCost > 0 && (
            <p className="mt-2 text-xs text-hydro">
              Đồng hồ suy nghĩ Ban/Pick được cộng thêm +{formatSeconds(costRules.draftBonusSecondsPerCost)} cho mỗi 1 Cost đang dùng.
            </p>
          )}
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-gold/25 bg-bg/50 p-4">
          <div>
            <h4 className="text-sm font-bold text-gold-strong">Tính thử điểm từ Cost</h4>
            <p className="mt-1 text-xs text-muted">Nhập tổng Cost dự kiến của đội hình (hỗ trợ số lẻ):</p>
            <input
              type="number"
              min={0}
              step="0.5"
              value={sampleCost}
              onChange={(e) => setSampleCost(e.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-text focus:border-gold focus:outline-none"
            />
          </div>
          <div className="mt-4 rounded-lg bg-panel-2 p-3 text-center">
            <div className="text-xs text-muted">Điểm phạt cộng vào trận</div>
            <div className="text-2xl font-extrabold text-gold-strong">+{formatSeconds(samplePenalty)}</div>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <Tabs.Root defaultValue="characters">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold">Bảng tra cứu Cost theo Bộ luật</h3>
            <Tabs.List className="inline-flex rounded-lg border border-line bg-bg/60 p-1">
              <Tabs.Trigger
                value="characters"
                className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold text-muted transition data-[state=active]:bg-gold data-[state=active]:text-bg"
              >
                Nhân vật ({CHARACTERS.length})
              </Tabs.Trigger>
              <Tabs.Trigger
                value="weapons"
                className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold text-muted transition data-[state=active]:bg-gold data-[state=active]:text-bg"
              >
                Vũ khí ({WEAPONS_LIST.length})
              </Tabs.Trigger>
            </Tabs.List>
          </div>

          <Tabs.Content value="characters" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={charQuery}
                onChange={(e) => setCharQuery(e.target.value)}
                placeholder="Tìm nhân vật…"
                className="h-9 w-full max-w-xs rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <span>Sắp xếp</span>
                <select
                  value={charSort}
                  onChange={(e) => setCharSort(e.target.value as CharCostSortKey)}
                  className="h-9 cursor-pointer rounded-lg border border-line bg-bg/60 px-2.5 text-xs text-text focus:border-gold focus:outline-none"
                >
                  <option value="default">Mặc định</option>
                  <option value="name_asc">Tên A → Z</option>
                  <option value="name_desc">Tên Z → A</option>
                  <option value="element">Theo hệ (Hỏa → Nham)</option>
                </select>
              </label>
              <Chip active={charRarity === 5} onClick={() => setCharRarity((r) => (r === 5 ? null : 5))}>
                5★
              </Chip>
              <Chip active={charRarity === 4} onClick={() => setCharRarity((r) => (r === 4 ? null : 4))}>
                4★
              </Chip>
              <Chip active={onlyCharOverrides} onClick={() => setOnlyCharOverrides((v) => !v)}>
                Đã chỉnh riêng ({charOverriddenCount})
              </Chip>
              <Chip active={onlyCharCustom} onClick={() => setOnlyCharCustom((v) => !v)}>
                Điều kiện đặc biệt ({charCustomCount})
              </Chip>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc nhân vật theo hệ">
              <span className="mr-1 text-xs text-muted">Hệ:</span>
              {COST_ELEMENT_ORDER.map((el) => (
                <Chip key={el} active={charElements.includes(el)} onClick={() => toggleCharElement(el)}>
                  <ElementIcon element={el} className="size-3.5" />
                  {ELEMENT_LABEL[el]}
                </Chip>
              ))}
              <Chip active={charElements.includes('none')} onClick={() => toggleCharElement('none')}>
                Khác
              </Chip>
              {(charQuery || charElements.length > 0 || charRarity || onlyCharOverrides || onlyCharCustom) && (
                <button
                  type="button"
                  onClick={() => {
                    setCharQuery('')
                    setCharElements([])
                    setCharRarity(null)
                    setOnlyCharOverrides(false)
                    setOnlyCharCustom(false)
                  }}
                  className="ml-1 cursor-pointer text-xs font-medium text-gold underline-offset-2 hover:underline"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Nhân vật ({filteredCharacters.length})</th>
                    {CONSTELLATIONS.map((c) => (
                      <th key={c} className="px-2 py-2 text-center">
                        C{c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {filteredCharacters.map((c) => {
                    const isOverridden = c.slug in costRules.characterOverrides
                    const customList = charCustomMap[c.slug] ?? []
                    return (
                      <Fragment key={c.slug}>
                        <tr className={isOverridden || customList.length > 0 ? 'bg-gold/5' : undefined}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <img src={c.icon} alt="" className="size-7 rounded-md object-cover" loading="lazy" />
                              {c.element && <ElementIcon element={c.element} className="size-3.5 shrink-0" />}
                              <span className="font-medium text-text">{c.name}</span>
                              <span className="text-[11px] text-muted">{c.rarity}★</span>
                              {isOverridden && (
                                <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold-strong">
                                  Tùy chỉnh
                                </span>
                              )}
                              {customList.length > 0 && (
                                <span className="rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-semibold text-hydro">
                                  {customList.length} ĐK
                                </span>
                              )}
                            </div>
                          </td>
                          {CONSTELLATIONS.map((lvl) => {
                            const val = calcCharacterCost(c.slug, lvl, costRules)
                            return (
                              <td
                                key={lvl}
                                className={cn(
                                  'px-2 py-2 text-center font-mono',
                                  val > 0 ? 'font-semibold text-gold-strong' : 'text-muted/60',
                                )}
                              >
                                {formatCost(val)}
                              </td>
                            )
                          })}
                        </tr>
                        {customList.map((cc) => (
                          <tr key={`${c.slug}-${cc.id}`} className="bg-hydro/5 text-xs">
                            <td className="py-1.5 pr-3 pl-9">
                              <span className="mr-1.5 rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-bold text-hydro">
                                Điều kiện
                              </span>
                              <span className="text-text">{cc.note}</span>
                            </td>
                            {CONSTELLATIONS.map((lvl) => {
                              const val = cc.costs[lvl] ?? 0
                              return (
                                <td
                                  key={lvl}
                                  className={cn(
                                    'px-2 py-1.5 text-center font-mono',
                                    val > 0 ? 'font-semibold text-hydro' : 'text-muted/60',
                                  )}
                                >
                                  {formatCost(val)}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tabs.Content>

          <Tabs.Content value="weapons" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={weaponQuery}
                onChange={(e) => setWeaponQuery(e.target.value)}
                placeholder="Tìm vũ khí…"
                className="h-9 w-full max-w-xs rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <span>Sắp xếp</span>
                <select
                  value={weaponSort}
                  onChange={(e) => setWeaponSort(e.target.value as WeaponCostSortKey)}
                  className="h-9 cursor-pointer rounded-lg border border-line bg-bg/60 px-2.5 text-xs text-text focus:border-gold focus:outline-none"
                >
                  <option value="default">Mặc định</option>
                  <option value="name_asc">Tên A → Z</option>
                  <option value="name_desc">Tên Z → A</option>
                  <option value="rarity">Độ hiếm (5★ → 4★)</option>
                  <option value="weaponType">Loại vũ khí</option>
                </select>
              </label>
              {([5, 4] as const).map((r) => (
                <Chip
                  key={r}
                  active={weaponRarityFilter === r}
                  onClick={() => setWeaponRarityFilter((cur) => (cur === r ? null : r))}
                >
                  {r}★
                </Chip>
              ))}
              {WEAPONS.map((wt) => (
                <Chip
                  key={wt}
                  active={weaponTypeFilter === wt}
                  onClick={() => setWeaponTypeFilter((cur) => (cur === wt ? null : wt))}
                >
                  {WEAPON_LABEL[wt]}
                </Chip>
              ))}
              <Chip active={onlyWeaponOverrides} onClick={() => setOnlyWeaponOverrides((v) => !v)}>
                Đã chỉnh riêng ({overriddenWeaponCount})
              </Chip>
              <Chip active={onlyWeaponCustom} onClick={() => setOnlyWeaponCustom((v) => !v)}>
                Điều kiện đặc biệt ({weaponCustomCount})
              </Chip>
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Vũ khí ({filteredWeapons.length})</th>
                    <th className="px-2 py-2 text-center">Cost</th>
                    {REFINEMENTS.map((r) => (
                      <th key={r} className="px-2 py-2 text-center">
                        R{r} (s)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {filteredWeapons.map((w) => {
                    const isBaseOverridden =
                      w.slug in costRules.weaponCostOverrides ||
                      w.slug in costRules.weaponRefinementOverrides
                    const customList = weaponCustomMap[w.slug] ?? []
                    const baseCost = calcWeaponCost(w.slug, costRules)
                    return (
                      <Fragment key={w.slug}>
                        <tr className={isBaseOverridden || customList.length > 0 ? 'bg-gold/5' : undefined}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <img src={w.icon} alt="" className="size-7 rounded-md bg-bg/60 object-contain" loading="lazy" />
                              <span className="font-medium text-text">{w.name}</span>
                              <span className="text-[11px] text-muted">
                                {w.rarity}★ · {WEAPON_LABEL[w.weaponType]}
                              </span>
                              {isBaseOverridden && (
                                <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold-strong">
                                  Tùy chỉnh
                                </span>
                              )}
                              {customList.length > 0 && (
                                <span className="rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-semibold text-hydro">
                                  {customList.length} ĐK
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={cn(
                              'px-2 py-2 text-center font-mono',
                              baseCost > 0 ? 'font-semibold text-gold-strong' : 'text-muted/60',
                            )}
                          >
                            {formatCost(baseCost)}
                          </td>
                          {REFINEMENTS.map((r) => {
                            const val = calcWeaponRefinementSeconds(w.slug, r, costRules)
                            return (
                              <td
                                key={r}
                                className={cn(
                                  'px-2 py-2 text-center font-mono',
                                  val > 0 ? 'font-semibold text-pyro' : 'text-muted/60',
                                )}
                              >
                                {val > 0 ? `+${formatSeconds(val)}` : '0s'}
                              </td>
                            )
                          })}
                        </tr>
                        {customList.map((wc) => (
                          <tr key={`${w.slug}-${wc.id}`} className="bg-hydro/5 text-xs">
                            <td className="py-1.5 pr-3 pl-9">
                              <span className="mr-1.5 rounded bg-hydro/20 px-1.5 py-0.5 text-[10px] font-bold text-hydro">
                                Điều kiện
                              </span>
                              <span className="text-text">{wc.note}</span>
                            </td>
                            <td
                              className={cn(
                                'px-2 py-1.5 text-center font-mono',
                                wc.cost > 0 ? 'font-semibold text-hydro' : 'text-muted/60',
                              )}
                            >
                              {formatCost(wc.cost)}
                            </td>
                            {REFINEMENTS.map((r, rIdx) => {
                              const val = wc.refinementSeconds[rIdx] ?? 0
                              return (
                                <td
                                  key={r}
                                  className={cn(
                                    'px-2 py-1.5 text-center font-mono',
                                    val > 0 ? 'font-semibold text-pyro' : 'text-muted/60',
                                  )}
                                >
                                  {val > 0 ? `+${formatSeconds(val)}` : '0s'}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </section>
    </div>
  )
}

function StatBox({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bg/50 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cn('text-sm font-bold', cls ?? 'text-text')}>{value}</div>
    </div>
  )
}
