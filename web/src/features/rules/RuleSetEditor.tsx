import * as Tabs from '@radix-ui/react-tabs'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { CHARACTER_BY_SLUG } from '@/domain/characters'
import {
  createDefaultRuleSetConfig,
  TIE_BREAK_OPTIONS,
  type CharacterCustomCost,
  type RuleSet,
  type RuleSetConfig,
  type TieBreakRule,
  type WeaponCustomCost,
} from '@/domain/ruleset'
import { WEAPON_BY_SLUG } from '@/domain/weapons'
import { errorMessage } from '@/features/auth/authStore'
import { rulesetService } from '@/services'
import { CharacterCostOverrides } from './CharacterCostOverrides'
import { CopyRuleSetDialog, type CopyScope } from './CopyRuleSetDialog'
import { CostMilestonesEditor } from './CostMilestonesEditor'
import { DraftStepsEditor } from './DraftStepsEditor'
import { WeaponCostOverrides } from './WeaponCostOverrides'

interface Props {
  initial: RuleSet | null
  template?: RuleSet | null
  existingRulesets?: RuleSet[]
  onCancel: () => void
  onSaved: (saved: RuleSet) => void
}

export function RuleSetEditor({
  initial,
  template = null,
  existingRulesets = [],
  onCancel,
  onSaved,
}: Props) {
  const seed = initial ?? template
  const [name, setName] = useState(
    initial ? initial.name : template ? `${template.name} (Bản sao)` : 'Bộ luật mới',
  )
  const [description, setDescription] = useState(seed?.description ?? '')
  const [isActive, setIsActive] = useState(initial ? initial.isActive : true)
  const [isDefault, setIsDefault] = useState(initial ? initial.isDefault : false)
  const [config, setConfig] = useState<RuleSetConfig>(() =>
    seed ? structuredClone(seed.config) : createDefaultRuleSetConfig(),
  )
  const [saving, setSaving] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)

  const handleApplyCopy = (source: RuleSet, scope: CopyScope) => {
    const srcConfig = structuredClone(source.config)
    if (scope === 'full_config') {
      setConfig(srcConfig)
    } else if (scope === 'cost_all') {
      setConfig((prev) => ({ ...prev, costRules: srcConfig.costRules }))
    } else if (scope === 'cost_characters') {
      setConfig((prev) => ({
        ...prev,
        costRules: {
          ...prev.costRules,
          defaultChar5Costs: srcConfig.costRules.defaultChar5Costs,
          defaultChar4Costs: srcConfig.costRules.defaultChar4Costs,
          characterOverrides: srcConfig.costRules.characterOverrides,
          characterCustomCosts: srcConfig.costRules.characterCustomCosts ?? {},
        },
      }))
    } else if (scope === 'cost_weapons') {
      setConfig((prev) => ({
        ...prev,
        costRules: {
          ...prev.costRules,
          defaultWeapon5Cost: srcConfig.costRules.defaultWeapon5Cost,
          defaultWeapon4Cost: srcConfig.costRules.defaultWeapon4Cost,
          defaultWeapon5RefinementSeconds: srcConfig.costRules.defaultWeapon5RefinementSeconds,
          defaultWeapon4RefinementSeconds: srcConfig.costRules.defaultWeapon4RefinementSeconds,
          weaponCostOverrides: srcConfig.costRules.weaponCostOverrides,
          weaponRefinementOverrides: srcConfig.costRules.weaponRefinementOverrides,
          weaponCustomCosts: srcConfig.costRules.weaponCustomCosts ?? {},
        },
      }))
    }
    toast.success(`Đã sao chép cấu hình từ "${source.name}".`)
  }

  const handleSave = async () => {
    if (name.trim().length < 2) {
      toast.error('Tên bộ luật tối thiểu 2 ký tự.')
      return
    }

    for (const [slug, items] of Object.entries(config.costRules.characterCustomCosts ?? {})) {
      if (items.some((item) => !item.note.trim())) {
        const charName = CHARACTER_BY_SLUG.get(slug)?.name ?? slug
        toast.error(`Nhân vật "${charName}" có Custom Cost chưa nhập ghi chú điều kiện kích hoạt.`)
        return
      }
    }
    for (const [slug, items] of Object.entries(config.costRules.weaponCustomCosts ?? {})) {
      if (items.some((item) => !item.note.trim())) {
        const weaponName = WEAPON_BY_SLUG.get(slug)?.name ?? slug
        toast.error(`Vũ khí "${weaponName}" có Custom Cost chưa nhập ghi chú điều kiện kích hoạt.`)
        return
      }
    }

    setSaving(true)
    try {
      const prunedCharOverrides = Object.fromEntries(
        Object.entries(config.costRules.characterOverrides).filter(([slug]) =>
          CHARACTER_BY_SLUG.has(slug),
        ),
      )
      const prunedCharCustom: Record<string, CharacterCustomCost[]> = Object.fromEntries(
        Object.entries(config.costRules.characterCustomCosts ?? {})
          .filter(([slug, items]) => CHARACTER_BY_SLUG.has(slug) && items.length > 0)
          .map(([slug, items]) => [
            slug,
            items.map((item) => ({ ...item, note: item.note.trim() })),
          ]),
      )
      const prunedCostOverrides = Object.fromEntries(
        Object.entries(config.costRules.weaponCostOverrides).filter(([slug]) =>
          WEAPON_BY_SLUG.has(slug),
        ),
      )
      const prunedRefOverrides = Object.fromEntries(
        Object.entries(config.costRules.weaponRefinementOverrides).filter(([slug]) =>
          WEAPON_BY_SLUG.has(slug),
        ),
      )
      const prunedWeaponCustom: Record<string, WeaponCustomCost[]> = Object.fromEntries(
        Object.entries(config.costRules.weaponCustomCosts ?? {})
          .filter(([slug, items]) => WEAPON_BY_SLUG.has(slug) && items.length > 0)
          .map(([slug, items]) => [
            slug,
            items.map((item) => ({ ...item, note: item.note.trim() })),
          ]),
      )
      const cleanedConfig: RuleSetConfig = {
        ...config,
        costRules: {
          ...config.costRules,
          characterOverrides: prunedCharOverrides,
          characterCustomCosts: prunedCharCustom,
          weaponCostOverrides: prunedCostOverrides,
          weaponRefinementOverrides: prunedRefOverrides,
          weaponCustomCosts: prunedWeaponCustom,
        },
      }
      const payload = {
        name: name.trim(),
        description: description.trim(),
        isActive,
        isDefault,
        config: cleanedConfig,
      }
      const saved = initial
        ? await rulesetService.update(initial.id, payload)
        : await rulesetService.create(payload)
      toast.success(initial ? 'Đã cập nhật bộ luật.' : 'Đã tạo bộ luật mới.')
      onSaved(saved)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel border-gold/40 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-lg font-bold text-gold-strong">
            {initial
              ? `Chỉnh sửa bộ luật: ${initial.name}`
              : template
                ? `Nhân bản bộ luật từ: ${template.name}`
                : 'Tạo bộ luật mới (Admin)'}
          </h2>
          <p className="text-xs text-muted">
            Thay đổi thứ tự Ban/Pick, bảng Cost nhân vật/vũ khí, Custom Cost điều kiện đặc biệt và các mốc quy đổi giây.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {existingRulesets.length > 0 && (
            <Button variant="secondary" onClick={() => setCopyOpen(true)} disabled={saving}>
              Sao chép từ luật đã có…
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Lưu bộ luật
          </Button>
        </div>
      </div>

      <Tabs.Root defaultValue="general" className="flex flex-col gap-5">
        <Tabs.List className="flex flex-wrap gap-1 rounded-lg border border-line bg-bg/60 p-1">
          {[
            ['general', '1. Thông tin & Thứ tự Ban/Pick'],
            ['milestones', '2. Cost mặc định & Mốc giây'],
            ['characters', '3. Cost Nhân vật (4★ & 5★)'],
            ['weapons', '4. Vũ khí (Cost & Tinh luyện)'],
          ].map(([val, label]) => (
            <Tabs.Trigger
              key={val}
              value={val}
              className="cursor-pointer rounded-md px-3 py-2 text-xs font-semibold text-muted transition data-[state=active]:bg-gold data-[state=active]:text-bg"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="general" className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Tên bộ luật"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text/90">Mô tả ngắn</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tóm tắt quy tắc giải đấu…"
                className="h-11 rounded-lg border border-line bg-bg/60 px-3 text-text focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-text">Thời gian mỗi lượt Ban (giây)</span>
              <input
                type="number"
                min={0}
                max={600}
                value={config.banSeconds ?? config.perTurnSeconds}
                onChange={(e) => {
                  const val = Math.min(600, Math.max(0, Number(e.target.value) || 0))
                  setConfig({ ...config, banSeconds: val })
                }}
                className="h-9 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text"
              />
              <span className="text-[11px] text-muted">0 = không giới hạn thời gian Ban</span>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-text">Thời gian mỗi lượt Pick (giây)</span>
              <input
                type="number"
                min={0}
                max={600}
                value={config.pickSeconds ?? config.perTurnSeconds}
                onChange={(e) => {
                  const val = Math.min(600, Math.max(0, Number(e.target.value) || 0))
                  setConfig({ ...config, pickSeconds: val, perTurnSeconds: val })
                }}
                className="h-9 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text"
              />
              <span className="text-[11px] text-muted">0 = không giới hạn thời gian Pick</span>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-text">Thời gian trống điền Vũ khí (giây)</span>
              <input
                type="number"
                min={0}
                max={900}
                value={config.weaponPhaseSeconds}
                onChange={(e) =>
                  setConfig({ ...config, weaponPhaseSeconds: Math.max(0, Number(e.target.value) || 0) })
                }
                className="h-9 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text"
              />
              <span className="text-[11px] text-muted">Khoảng trống sau khi Ban/Pick đủ</span>
            </label>

            <div className="flex flex-col justify-center gap-2 rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={config.allowDuplicatePick}
                  onChange={(e) => setConfig({ ...config, allowDuplicatePick: e.target.checked })}
                  className="size-4 accent-[var(--color-gold)]"
                />
                <span>Cho phép 2 bên Pick trùng NV</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 accent-[var(--color-gold)]"
                />
                <span>Hiển thị để tạo trận</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="size-4 accent-[var(--color-gold)]"
                />
                <span>Đặt làm bộ luật mặc định</span>
              </label>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-line bg-bg/40 p-3.5 md:grid-cols-2">
            <div className="flex flex-col justify-center gap-1.5 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-semibold text-text select-none">
                <input
                  type="checkbox"
                  checked={config.useReserveTime ?? false}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      useReserveTime: e.target.checked,
                      reserveTimeSeconds: config.reserveTimeSeconds ?? 120,
                    })
                  }
                  className="size-4 accent-[var(--color-gold)]"
                />
                <span>Sử dụng Thời gian gốc (Reserve Time)</span>
              </label>
              <p className="text-[11px] text-muted">
                Khi hết thời gian lượt Ban hoặc Pick, thời gian tiêu hao thêm sẽ trừ thẳng vào thời gian gốc của người chơi trước khi tính phạt quá giờ (mặc định 120s).
              </p>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-text">Thời gian gốc cấp mỗi người chơi (giây)</span>
              <input
                type="number"
                min={0}
                max={3600}
                disabled={!(config.useReserveTime ?? false)}
                value={config.reserveTimeSeconds ?? 120}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    reserveTimeSeconds: Math.min(3600, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="h-9 max-w-xs rounded-lg border border-line bg-bg/60 px-3 text-sm text-text disabled:opacity-45"
              />
              <span className="text-[11px] text-muted">Mặc định: 120 giây (2:00) cho mỗi bên</span>
            </label>
          </div>

          <div className="grid gap-4 rounded-lg border border-line bg-bg/40 p-3.5 md:grid-cols-2">
            <div className="flex flex-col justify-center gap-1 text-xs">
              <span className="font-semibold text-text">Dừng đồng hồ &amp; xử thua khi âm quá giới hạn</span>
              <p className="text-[11px] text-muted">
                Khi tổng thời gian âm (sau khi hết thời gian gốc nếu bật) chạm mốc này, đồng hồ sẽ dừng lại và bên đang tới lượt bị xử thua ngay lập tức. Đặt 0 để tắt xử thua tự động.
              </p>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-text">Giới hạn âm tối đa trước khi xử thua (giây)</span>
              <input
                type="number"
                min={0}
                max={3600}
                value={config.maxOvertimeSeconds ?? 600}
                onChange={(e) => {
                  const raw = Number(e.target.value)
                  const val = Number.isFinite(raw) ? Math.min(3600, Math.max(0, Math.trunc(raw))) : 0
                  setConfig({ ...config, maxOvertimeSeconds: val })
                }}
                className="h-9 max-w-xs rounded-lg border border-line bg-bg/60 px-3 text-sm text-text"
              />
              <span className="text-[11px] text-muted">
                {(config.maxOvertimeSeconds ?? 600) === 0
                  ? 'Đang tắt — đồng hồ có thể âm vô hạn'
                  : `Mặc định: 600 giây (10:00). Hiện tại: ${Math.floor((config.maxOvertimeSeconds ?? 600) / 60)}:${String((config.maxOvertimeSeconds ?? 600) % 60).padStart(2, '0')}`}
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-line bg-bg/40 p-3.5">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-semibold text-text">
                Phân định ván hòa (Tie-break khi bằng tổng điểm giây)
              </span>
              <select
                value={config.tieBreakRule ?? 'none'}
                onChange={(e) =>
                  setConfig({ ...config, tieBreakRule: e.target.value as TieBreakRule })
                }
                className="h-9 max-w-md rounded-lg border border-line bg-panel px-3 text-sm text-text focus:border-gold focus:outline-none"
              >
                {TIE_BREAK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted">
                {
                  TIE_BREAK_OPTIONS.find((o) => o.value === (config.tieBreakRule ?? 'none'))
                    ?.description
                }
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-line bg-bg/30 p-4">
            <h3 className="mb-3 text-sm font-bold text-text">Tùy chỉnh thứ tự & thời gian từng lượt Ban / Pick</h3>
            <DraftStepsEditor
              steps={config.draftSteps}
              banSeconds={config.banSeconds ?? config.perTurnSeconds}
              pickSeconds={config.pickSeconds ?? config.perTurnSeconds}
              onChange={(draftSteps) => setConfig({ ...config, draftSteps })}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="milestones">
          <CostMilestonesEditor
            costRules={config.costRules}
            onChange={(costRules) => setConfig({ ...config, costRules })}
          />
        </Tabs.Content>

        <Tabs.Content value="characters">
          <CharacterCostOverrides
            costRules={config.costRules}
            rulesetName={name}
            onChange={(costRules) => setConfig({ ...config, costRules })}
          />
        </Tabs.Content>

        <Tabs.Content value="weapons">
          <WeaponCostOverrides
            costRules={config.costRules}
            rulesetName={name}
            onChange={(costRules) => setConfig({ ...config, costRules })}
          />
        </Tabs.Content>
      </Tabs.Root>

      <CopyRuleSetDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        rulesets={existingRulesets}
        currentId={initial?.id}
        onApply={handleApplyCopy}
      />
    </section>
  )
}
