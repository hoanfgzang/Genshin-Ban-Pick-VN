import { Button } from '@/components/ui/Button'
import { calcCostPenaltySeconds, formatSeconds } from '@/domain/cost'
import type { CostMilestone, CostRules } from '@/domain/ruleset'

interface Props {
  costRules: CostRules
  onChange: (next: CostRules) => void
}

function CostArrayRow({
  label,
  headers,
  values,
  onChange,
}: {
  label: string
  headers: string[]
  values: number[]
  onChange: (next: number[]) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line/70 bg-bg/40 p-3">
      <div className="text-xs font-semibold text-text">{label}</div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
        {headers.map((h, idx) => (
          <label key={h} className="flex flex-col gap-1 text-center text-[11px] text-muted">
            <span>{h}</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={values[idx] ?? 0}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value) || 0)
                onChange(values.map((old, i) => (i === idx ? v : old)))
              }}
              className="h-8 w-full rounded border border-line bg-panel px-1.5 text-center font-mono text-xs text-text focus:border-gold focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export function CostMilestonesEditor({ costRules, onChange }: Props) {
  const updateField = <K extends keyof CostRules>(key: K, value: CostRules[K]) => {
    onChange({ ...costRules, [key]: value })
  }

  const updateMilestone = (idx: number, patch: Partial<CostMilestone>) => {
    const next = costRules.milestones.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    updateField('milestones', next)
  }

  const addMilestone = () => {
    const last = costRules.milestones[costRules.milestones.length - 1]
    const nextMin = last ? (last.maxCost ?? last.minCost + 5) : 0
    updateField('milestones', [
      ...costRules.milestones,
      { minCost: nextMin, maxCost: null, secondsPerCost: costRules.baseSecondsPerCost, bonusSeconds: 0 },
    ])
  }

  const removeMilestone = (idx: number) => {
    updateField(
      'milestones',
      costRules.milestones.filter((_, i) => i !== idx),
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-2">
        <CostArrayRow
          label="Cost mặc định Nhân vật 5★ (C0–C6)"
          headers={['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6']}
          values={costRules.defaultChar5Costs}
          onChange={(v) => updateField('defaultChar5Costs', v)}
        />
        <CostArrayRow
          label="Cost mặc định Nhân vật 4★ (C0–C6)"
          headers={['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6']}
          values={costRules.defaultChar4Costs}
          onChange={(v) => updateField('defaultChar4Costs', v)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line/70 bg-bg/40 p-3">
        <div>
          <div className="text-xs font-semibold text-text">
            Cost cơ bản mặc định Vũ khí (không tăng theo tinh luyện)
          </div>
          <p className="text-[11px] text-muted">
            Cost vũ khí chỉ tính 1 lần vào tổng Cost đội hình bất kể tinh luyện R1–R5.
          </p>
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>Vũ khí 5★</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={costRules.defaultWeapon5Cost}
              onChange={(e) =>
                updateField('defaultWeapon5Cost', Math.max(0, Number(e.target.value) || 0))
              }
              className="h-8 w-full rounded border border-line bg-panel px-2 text-center font-mono text-xs text-text focus:border-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>Vũ khí 4★</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={costRules.defaultWeapon4Cost}
              onChange={(e) =>
                updateField('defaultWeapon4Cost', Math.max(0, Number(e.target.value) || 0))
              }
              className="h-8 w-full rounded border border-line bg-panel px-2 text-center font-mono text-xs text-text focus:border-gold focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <CostArrayRow
          label="Thời gian cộng thêm tinh luyện Vũ khí 5★ (giây · R1–R5)"
          headers={['R1 (s)', 'R2 (s)', 'R3 (s)', 'R4 (s)', 'R5 (s)']}
          values={costRules.defaultWeapon5RefinementSeconds}
          onChange={(v) => updateField('defaultWeapon5RefinementSeconds', v)}
        />
        <CostArrayRow
          label="Thời gian cộng thêm tinh luyện Vũ khí 4★ (giây · R1–R5)"
          headers={['R1 (s)', 'R2 (s)', 'R3 (s)', 'R4 (s)', 'R5 (s)']}
          values={costRules.defaultWeapon4RefinementSeconds}
          onChange={(v) => updateField('defaultWeapon4RefinementSeconds', v)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-text">Hệ số cơ bản: 1 Cost = bao nhiêu giây (Điểm)</span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={costRules.baseSecondsPerCost}
            onChange={(e) => updateField('baseSecondsPerCost', Math.max(0, Number(e.target.value) || 0))}
            className="h-9 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
          />
          <span className="text-[11px] text-muted">Dùng khi chưa thiết lập mốc hoặc khi Tổng Cost nằm ngoài các mốc.</span>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-text">Cộng thêm giờ đồng hồ Ban/Pick mỗi 1 Cost (giây)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={costRules.draftBonusSecondsPerCost}
            onChange={(e) => updateField('draftBonusSecondsPerCost', Math.max(0, Number(e.target.value) || 0))}
            className="h-9 rounded-lg border border-line bg-bg/60 px-3 text-sm text-text focus:border-gold focus:outline-none"
          />
          <span className="text-[11px] text-muted">Đặt 0 nếu Cost chỉ cộng vào điểm thi đấu cuối trận.</span>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-text">Các mốc cộng thời gian theo Cost</h4>
            <p className="text-xs text-muted">
              Khi đạt mốc [Từ Cost, Đến Cost), tổng thời gian = Tổng Cost × Giây/Cost (+ giây cố định của mốc). Ví dụ: 0–6 tính 5s/cost; chạm 6–12 tính 8s/cost (6 Cost = 48s, 8 Cost = 64s); từ 12 trở lên tính 12s/cost.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={addMilestone}>
            + Thêm mốc
          </Button>
        </div>

        {costRules.milestones.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">
            Chưa có mốc Cost — đang dùng hệ số cơ bản ({formatSeconds(costRules.baseSecondsPerCost)} / cost).
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {costRules.milestones.map((m, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 items-end gap-2 rounded-lg border border-line bg-bg/40 p-2.5 sm:grid-cols-5"
              >
                <label className="flex flex-col gap-1 text-[11px] text-muted">
                  <span>Từ Cost (Min)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={m.minCost}
                    onChange={(e) => updateMilestone(idx, { minCost: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-8 rounded border border-line bg-panel px-2 text-xs text-text"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted">
                  <span>Đến Cost (để trống = ∞)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="∞"
                    value={m.maxCost ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim()
                      updateMilestone(idx, { maxCost: raw === '' ? null : Math.max(m.minCost + 0.5, Number(raw) || 0) })
                    }}
                    className="h-8 rounded border border-line bg-panel px-2 text-xs text-text"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted">
                  <span>Giây / 1 Cost</span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={m.secondsPerCost}
                    onChange={(e) => updateMilestone(idx, { secondsPerCost: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-8 rounded border border-line bg-panel px-2 text-xs text-text"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted">
                  <span>Cộng cố định (giây)</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={m.bonusSeconds}
                    onChange={(e) => updateMilestone(idx, { bonusSeconds: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-8 rounded border border-line bg-panel px-2 text-xs text-text"
                  />
                </label>
                <Button size="sm" variant="danger" onClick={() => removeMilestone(idx)}>
                  Xóa mốc
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
          {[4, 6, 8, 12, 16].map((sample) => (
            <span key={sample} className="rounded bg-panel-2 px-2 py-1">
              {sample} Cost ={' '}
              <strong className="text-gold-strong">
                +{formatSeconds(calcCostPenaltySeconds(sample, costRules))}
              </strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
