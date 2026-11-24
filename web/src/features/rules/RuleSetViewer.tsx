import * as Tabs from '@radix-ui/react-tabs'
import { useMemo, useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { WEAPON_LABEL, type Rarity, type WeaponType, WEAPONS } from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import {
  calcCharacterCost,
  calcCostPenaltySeconds,
  calcWeaponCost,
  formatCost,
  formatSeconds,
} from '@/domain/cost'
import type { RuleSet } from '@/domain/ruleset'
import { REFINEMENTS, type WeaponRarity } from '@/domain/weapon'
import { WEAPONS_LIST } from '@/domain/weapons'
import { cn } from '@/lib/cn'

interface Props {
  ruleset: RuleSet
}

const CONSTELLATIONS = [0, 1, 2, 3, 4, 5, 6] as const

export function RuleSetViewer({ ruleset }: Props) {
  const { config } = ruleset
  const { costRules } = config
  const [sampleCost, setSampleCost] = useState('8')
  const [charQuery, setCharQuery] = useState('')
  const [charRarity, setCharRarity] = useState<Rarity | null>(null)
  const [onlyCharOverrides, setOnlyCharOverrides] = useState(false)

  const [weaponQuery, setWeaponQuery] = useState('')
  const [weaponTypeFilter, setWeaponTypeFilter] = useState<WeaponType | null>(null)
  const [weaponRarityFilter, setWeaponRarityFilter] = useState<WeaponRarity | null>(null)
  const [onlyWeaponOverrides, setOnlyWeaponOverrides] = useState(false)

  const blueBans = config.draftSteps.filter((s) => s.side === 'blue' && s.action === 'ban').length
  const bluePicks = config.draftSteps.filter((s) => s.side === 'blue' && s.action === 'pick').length
  const redBans = config.draftSteps.filter((s) => s.side === 'red' && s.action === 'ban').length
  const redPicks = config.draftSteps.filter((s) => s.side === 'red' && s.action === 'pick').length

  const parsedSampleCost = Number.isFinite(Number(sampleCost)) ? Math.max(0, Number(sampleCost)) : 0
  const samplePenalty = calcCostPenaltySeconds(parsedSampleCost, costRules)

  const filteredCharacters = useMemo(() => {
    const q = charQuery.trim().toLowerCase()
    return CHARACTERS.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.slug.includes(q)) return false
      if (charRarity && c.rarity !== charRarity) return false
      if (onlyCharOverrides && !(c.slug in costRules.characterOverrides)) return false
      return true
    })
  }, [charQuery, charRarity, onlyCharOverrides, costRules.characterOverrides])

  const filteredWeapons = useMemo(() => {
    const q = weaponQuery.trim().toLowerCase()
    return WEAPONS_LIST.filter((w) => {
      if (q && !w.name.toLowerCase().includes(q) && !w.slug.includes(q)) return false
      if (weaponTypeFilter && w.weaponType !== weaponTypeFilter) return false
      if (weaponRarityFilter && w.rarity !== weaponRarityFilter) return false
      if (onlyWeaponOverrides && !(w.slug in costRules.weaponOverrides)) return false
      return true
    })
  }, [weaponQuery, weaponTypeFilter, weaponRarityFilter, onlyWeaponOverrides, costRules.weaponOverrides])

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
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <StatBox label="Đội Xanh (Trái)" value={`${blueBans} Ban · ${bluePicks} Pick`} cls="text-hydro" />
            <StatBox label="Đội Đỏ (Phải)" value={`${redBans} Ban · ${redPicks} Pick`} cls="text-danger" />
            <StatBox
              label="Mỗi lượt / Vũ khí"
              value={`${config.perTurnSeconds || '∞'}s / ${config.weaponPhaseSeconds || '∞'}s`}
            />
            <StatBox label="Mốc 3 ải cố định" value="09:00 / ải" cls="text-gold-strong" />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Thứ tự Ban / Pick ({config.draftSteps.length} lượt — Xanh Dương bên trái đi trước)
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {config.draftSteps.map((s) => (
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
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel grid gap-5 p-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-base font-bold text-text">Quy tắc quy đổi Cost sang Điểm (Giây cộng thêm)</h3>
          <p className="mb-3 text-xs text-muted">
            Điểm từ Cost được cộng thẳng vào tổng điểm (giây) của người chơi cùng với kết quả{' '}
            <strong className="text-text">09:00 − thời gian hoàn thành</strong> của 3 ải. Ai ít điểm nhất người đó thắng.
          </p>
          {costRules.milestones.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Khoảng Cost</th>
                    <th className="px-3 py-2">Mỗi 1 Cost cộng</th>
                    <th className="px-3 py-2">Cộng thêm khi chạm mốc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {costRules.milestones.map((m, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium">
                        {formatCost(m.minCost)} → {m.maxCost === null ? '∞' : formatCost(m.maxCost)}
                      </td>
                      <td className="px-3 py-2 text-gold-strong">+{formatSeconds(m.secondsPerCost)} / cost</td>
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
              <Chip active={charRarity === 5} onClick={() => setCharRarity((r) => (r === 5 ? null : 5))}>
                5★
              </Chip>
              <Chip active={charRarity === 4} onClick={() => setCharRarity((r) => (r === 4 ? null : 4))}>
                4★
              </Chip>
              <Chip active={onlyCharOverrides} onClick={() => setOnlyCharOverrides((v) => !v)}>
                Đã chỉnh riêng ({Object.keys(costRules.characterOverrides).length})
              </Chip>
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Nhân vật</th>
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
                    return (
                      <tr key={c.slug} className={isOverridden ? 'bg-gold/5' : undefined}>
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
              {([5, 4, 3] as const).map((r) => (
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
                Đã chỉnh riêng ({Object.keys(costRules.weaponOverrides).length})
              </Chip>
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-panel-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Vũ khí</th>
                    {REFINEMENTS.map((r) => (
                      <th key={r} className="px-2 py-2 text-center">
                        R{r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {filteredWeapons.map((w) => {
                    const isOverridden = w.slug in costRules.weaponOverrides
                    return (
                      <tr key={w.slug} className={isOverridden ? 'bg-gold/5' : undefined}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <img src={w.icon} alt="" className="size-7 rounded-md bg-bg/60 object-contain" loading="lazy" />
                            <span className="font-medium text-text">{w.name}</span>
                            <span className="text-[11px] text-muted">
                              {w.rarity}★ · {WEAPON_LABEL[w.weaponType]}
                            </span>
                            {isOverridden && (
                              <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold-strong">
                                Tùy chỉnh
                              </span>
                            )}
                          </div>
                        </td>
                        {REFINEMENTS.map((r) => {
                          const val = calcWeaponCost(w.slug, r, costRules)
                          return (
                            <td
                              key={r}
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
