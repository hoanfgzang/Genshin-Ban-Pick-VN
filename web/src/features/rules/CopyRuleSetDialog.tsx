import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import type { RuleSet } from '@/domain/ruleset'
import { cn } from '@/lib/cn'

export type CopyScope = 'cost_all' | 'cost_characters' | 'cost_weapons' | 'full_config'

const SCOPE_OPTIONS: ReadonlyArray<{
  value: CopyScope
  label: string
  description: string
}> = [
  {
    value: 'cost_all',
    label: 'Chỉ phần Cost (Mặc định, Mốc giây, Cost NV & Vũ khí)',
    description: 'Giữ nguyên tên, mô tả, thời gian và thứ tự Ban/Pick; chỉ sao chép toàn bộ bảng Cost & Custom Cost.',
  },
  {
    value: 'cost_characters',
    label: 'Chỉ Cost Nhân vật (C0–C6 & Custom Cost NV)',
    description: 'Chỉ sao chép Cost mặc định 4★/5★, bảng tùy chỉnh từng nhân vật và các điều kiện Custom Cost nhân vật.',
  },
  {
    value: 'cost_weapons',
    label: 'Chỉ Cost Vũ khí (Cost, R1–R5 & Custom Cost VK)',
    description: 'Chỉ sao chép Cost mặc định, thời gian tinh luyện R1–R5, bảng tùy chỉnh vũ khí và Custom Cost vũ khí.',
  },
  {
    value: 'full_config',
    label: 'Toàn bộ cấu hình (Ban/Pick + Thời gian + Toàn bộ Cost)',
    description: 'Sao chép toàn bộ thiết lập trận đấu và bảng Cost từ bộ luật nguồn (vẫn giữ tên & mô tả hiện tại).',
  },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  rulesets: RuleSet[]
  currentId?: string | null
  onApply: (source: RuleSet, scope: CopyScope) => void
}

export function CopyRuleSetDialog({
  open,
  onOpenChange,
  rulesets,
  currentId,
  onApply,
}: Props) {
  const candidates = rulesets.filter((r) => r.id !== currentId)
  const pool = candidates.length > 0 ? candidates : rulesets

  const [selectedId, setSelectedId] = useState<string>(() => pool[0]?.id ?? '')
  const [scope, setScope] = useState<CopyScope>('cost_all')

  const effectiveId = pool.some((r) => r.id === selectedId) ? selectedId : (pool[0]?.id ?? '')
  const source = pool.find((r) => r.id === effectiveId) ?? null

  const summarize = (rs: RuleSet) => {
    const cr = rs.config.costRules
    const charOv = Object.keys(cr.characterOverrides).length
    const charCustom = Object.values(cr.characterCustomCosts ?? {}).reduce((s, a) => s + a.length, 0)
    const weapOv = new Set([
      ...Object.keys(cr.weaponCostOverrides),
      ...Object.keys(cr.weaponRefinementOverrides),
    ]).size
    const weapCustom = Object.values(cr.weaponCustomCosts ?? {}).reduce((s, a) => s + a.length, 0)
    return `${charOv} NV chỉnh riêng${charCustom > 0 ? ` · ${charCustom} ĐK NV` : ''} · ${weapOv} VK chỉnh riêng${weapCustom > 0 ? ` · ${weapCustom} ĐK VK` : ''}`
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sao chép cấu hình từ bộ luật đã có"
      description="Chọn bộ luật nguồn và phạm vi dữ liệu muốn chép sang bộ luật đang chỉnh sửa."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            variant="primary"
            disabled={!source}
            onClick={() => {
              if (!source) return
              onApply(source, scope)
              onOpenChange(false)
            }}
          >
            Áp dụng sao chép
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="font-semibold text-text">Bộ luật nguồn</span>
          <select
            value={effectiveId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-10 rounded-lg border border-line bg-bg/70 px-3 text-sm text-text focus:border-gold focus:outline-none"
          >
            {pool.map((rs) => (
              <option key={rs.id} value={rs.id}>
                {rs.name}
                {rs.isDefault ? ' (Mặc định)' : ''}
              </option>
            ))}
          </select>
          {source && (
            <span className="text-[11px] text-muted">{summarize(source)}</span>
          )}
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-text">Phạm vi sao chép</span>
          <div className="flex flex-col gap-2">
            {SCOPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition',
                  scope === opt.value
                    ? 'border-gold bg-gold/10'
                    : 'border-line bg-bg/40 hover:border-gold/40',
                )}
              >
                <input
                  type="radio"
                  name="copy-scope"
                  checked={scope === opt.value}
                  onChange={() => setScope(opt.value)}
                  className="mt-0.5 size-4 accent-[var(--color-gold)]"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-text">{opt.label}</span>
                  <span className="text-[11px] text-muted">{opt.description}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
