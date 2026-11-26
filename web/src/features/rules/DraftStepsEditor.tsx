import { Button } from '@/components/ui/Button'
import {
  createDefaultDraftSteps,
  splitDraftIntoPhases,
  validateDraftPhases,
  type DraftActionType,
  type DraftStep,
  type MatchSide,
} from '@/domain/ruleset'
import { cn } from '@/lib/cn'

interface Props {
  steps: DraftStep[]
  banSeconds: number
  pickSeconds: number
  onChange: (next: DraftStep[]) => void
}

function renumber(steps: DraftStep[]): DraftStep[] {
  return steps.map((s, idx) => ({ ...s, step: idx + 1 }))
}

export function DraftStepsEditor({ steps, banSeconds, pickSeconds, onChange }: Props) {
  const blueBans = steps.filter((s) => s.side === 'blue' && s.action === 'ban').length
  const bluePicks = steps.filter((s) => s.side === 'blue' && s.action === 'pick').length
  const redBans = steps.filter((s) => s.side === 'red' && s.action === 'ban').length
  const redPicks = steps.filter((s) => s.side === 'red' && s.action === 'pick').length
  const phases = splitDraftIntoPhases(steps)
  const phaseErrors = validateDraftPhases(steps)
  const stepToPhase = new Map<number, number>()
  for (const phase of phases) {
    for (const s of phase.steps) {
      stepToPhase.set(s.step, phase.phaseNumber)
    }
  }

  const toggleSide = (idx: number) => {
    const nextSide: MatchSide = steps[idx].side === 'blue' ? 'red' : 'blue'
    onChange(renumber(steps.map((s, i) => (i === idx ? { ...s, side: nextSide } : s))))
  }

  const toggleAction = (idx: number) => {
    const nextAction: DraftActionType = steps[idx].action === 'ban' ? 'pick' : 'ban'
    onChange(renumber(steps.map((s, i) => (i === idx ? { ...s, action: nextAction } : s))))
  }

  const move = (idx: number, delta: -1 | 1) => {
    const target = idx + delta
    if (target < 0 || target >= steps.length) return
    const copy = [...steps]
    ;[copy[idx], copy[target]] = [copy[target], copy[idx]]
    onChange(renumber(copy))
  }

  const remove = (idx: number) => {
    if (steps.length <= 2) return
    onChange(renumber(steps.filter((_, i) => i !== idx)))
  }

  const addStep = (side: MatchSide, action: DraftActionType) => {
    onChange(renumber([...steps, { step: steps.length + 1, side, action, seconds: null }]))
  }

  const updateSeconds = (idx: number, raw: string) => {
    const trimmed = raw.trim()
    const nextSeconds =
      trimmed === '' ? null : Math.min(600, Math.max(0, Math.trunc(Number(trimmed) || 0)))
    onChange(renumber(steps.map((s, i) => (i === idx ? { ...s, seconds: nextSeconds } : s))))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted">
          Đội Xanh (Trái): <strong className="text-hydro">{blueBans} Ban · {bluePicks} Pick</strong> | Đội Đỏ (Phải):{' '}
          <strong className="text-danger">{redBans} Ban · {redPicks} Pick</strong>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => addStep('blue', 'ban')}>
            + Xanh Ban
          </Button>
          <Button size="sm" variant="secondary" onClick={() => addStep('red', 'ban')}>
            + Đỏ Ban
          </Button>
          <Button size="sm" variant="secondary" onClick={() => addStep('blue', 'pick')}>
            + Xanh Pick
          </Button>
          <Button size="sm" variant="secondary" onClick={() => addStep('red', 'pick')}>
            + Đỏ Pick
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange(createDefaultDraftSteps())}>
            Nạp mẫu chuẩn (3 Ban · 8 Pick)
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold text-muted">Phân chia Phase:</span>
        {phases.map((p) => {
          const balanced = p.blueBans === p.redBans
          return (
            <span
              key={p.phaseNumber}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium',
                balanced
                  ? 'border-line bg-bg/60 text-text'
                  : 'border-danger/60 bg-danger/15 text-danger',
              )}
            >
              <strong className={balanced ? 'text-gold-strong' : 'text-danger'}>
                Phase {p.phaseNumber}
              </strong>
              <span>
                Ban {p.blueBans}-{p.redBans} · Pick {p.bluePicks}-{p.redPicks}
              </span>
            </span>
          )
        })}
      </div>

      {phaseErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          <div className="font-bold">Quy tắc Phase chưa hợp lệ (số lượt Ban 2 bên trong cùng 1 Phase phải bằng nhau):</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {phaseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
              s.side === 'blue' ? 'border-hydro/40 bg-hydro/5' : 'border-danger/40 bg-danger/5',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[10px] font-bold text-gold-strong">
                P{stepToPhase.get(s.step) ?? 1}
              </span>
              <span className="w-6 font-mono text-muted">#{s.step}</span>
              <button
                type="button"
                onClick={() => toggleSide(idx)}
                className={cn(
                  'cursor-pointer rounded px-2 py-0.5 font-semibold',
                  s.side === 'blue' ? 'bg-hydro/20 text-hydro' : 'bg-danger/20 text-danger',
                )}
                title="Bấm để đổi bên Xanh / Đỏ"
              >
                {s.side === 'blue' ? 'Xanh' : 'Đỏ'}
              </button>
              <button
                type="button"
                onClick={() => toggleAction(idx)}
                className={cn(
                  'cursor-pointer rounded px-2 py-0.5 font-bold uppercase',
                  s.action === 'ban' ? 'bg-black/40 text-muted' : 'bg-gold/20 text-gold-strong',
                )}
                title="Bấm để đổi BAN / PICK"
              >
                {s.action}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={600}
                value={s.seconds ?? ''}
                placeholder={`${s.action === 'ban' ? banSeconds : pickSeconds}s`}
                onChange={(e) => updateSeconds(idx, e.target.value)}
                title="Thời gian riêng cho lượt này (để trống = dùng mặc định Ban/Pick)"
                aria-label={`Thời gian lượt ${s.step} (giây)`}
                className="h-6 w-14 rounded border border-line bg-bg/70 px-1 text-center font-mono text-[11px] text-text placeholder:text-muted/60 focus:border-gold focus:outline-none"
              />
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="cursor-pointer rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-30"
                aria-label="Lên"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === steps.length - 1}
                className="cursor-pointer rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-30"
                aria-label="Xuống"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={steps.length <= 2}
                className="cursor-pointer rounded px-1.5 py-0.5 text-danger hover:bg-danger/15 disabled:opacity-30"
                aria-label="Xóa lượt"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
