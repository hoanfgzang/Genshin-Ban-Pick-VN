import * as Tabs from '@radix-ui/react-tabs'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { createDefaultRuleSetConfig, type RuleSet, type RuleSetConfig } from '@/domain/ruleset'
import { WEAPON_BY_SLUG } from '@/domain/weapons'
import { errorMessage } from '@/features/auth/authStore'
import { rulesetService } from '@/services'
import { CharacterCostOverrides } from './CharacterCostOverrides'
import { CostMilestonesEditor } from './CostMilestonesEditor'
import { DraftStepsEditor } from './DraftStepsEditor'
import { WeaponCostOverrides } from './WeaponCostOverrides'

interface Props {
  initial: RuleSet | null
  onCancel: () => void
  onSaved: (saved: RuleSet) => void
}

export function RuleSetEditor({ initial, onCancel, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? 'Bộ luật mới')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)
  const [config, setConfig] = useState<RuleSetConfig>(() =>
    initial ? structuredClone(initial.config) : createDefaultRuleSetConfig(),
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (name.trim().length < 2) {
      toast.error('Tên bộ luật tối thiểu 2 ký tự.')
      return
    }
    setSaving(true)
    try {
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
      const cleanedConfig: RuleSetConfig = {
        ...config,
        costRules: {
          ...config.costRules,
          weaponCostOverrides: prunedCostOverrides,
          weaponRefinementOverrides: prunedRefOverrides,
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
            {initial ? `Chỉnh sửa bộ luật: ${initial.name}` : 'Tạo bộ luật mới (Admin)'}
          </h2>
          <p className="text-xs text-muted">
            Thay đổi thứ tự Ban/Pick, bảng Cost nhân vật/vũ khí và các mốc quy đổi giây cho bộ luật này.
          </p>
        </div>
        <div className="flex gap-2">
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
              <span className="font-medium text-text">Thời gian mỗi lượt Ban/Pick (giây)</span>
              <input
                type="number"
                min={0}
                max={600}
                value={config.perTurnSeconds}
                onChange={(e) =>
                  setConfig({ ...config, perTurnSeconds: Math.max(0, Number(e.target.value) || 0) })
                }
                className="h-9 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text"
              />
              <span className="text-[11px] text-muted">0 = không giới hạn thời gian lượt</span>
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

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs select-none">
              <input
                type="checkbox"
                checked={config.allowDuplicatePick}
                onChange={(e) => setConfig({ ...config, allowDuplicatePick: e.target.checked })}
                className="size-4 accent-[var(--color-gold)]"
              />
              <span>Cho phép 2 bên Pick trùng nhân vật</span>
            </label>

            <div className="flex flex-col justify-center gap-2 rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs">
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

          <div className="rounded-xl border border-line bg-bg/30 p-4">
            <h3 className="mb-3 text-sm font-bold text-text">Tùy chỉnh thứ tự từng lượt Ban / Pick</h3>
            <DraftStepsEditor
              steps={config.draftSteps}
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
            onChange={(costRules) => setConfig({ ...config, costRules })}
          />
        </Tabs.Content>

        <Tabs.Content value="weapons">
          <WeaponCostOverrides
            costRules={config.costRules}
            onChange={(costRules) => setConfig({ ...config, costRules })}
          />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  )
}
