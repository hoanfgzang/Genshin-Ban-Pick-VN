import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { toast } from '@/components/ui/toast'
import { getCharacter } from '@/domain/characters'
import {
  calcChamberDiff,
  formatCost,
  formatCostMilestoneSummary,
  formatSeconds,
  round2,
} from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { ChamberTimeInput, MatchState } from '@/services'
import { computeCostBreakdown } from './lineup'
import { countFourStarPicks, formatWinReason, getSeriesWinsForSide } from './series'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  isAdmin?: boolean
  onSubmitScores: (side: MatchSide, chambers: ChamberTimeInput[]) => void
}

const DEFAULT_CHAMBERS: ChamberTimeInput[] = [
  { minutes: 8, seconds: 0 },
  { minutes: 8, seconds: 0 },
  { minutes: 8, seconds: 0 },
]

interface SideScoreFormProps {
  side: MatchSide
  state: MatchState
  isMySide: boolean
  onSubmitScores: (side: MatchSide, chambers: ChamberTimeInput[]) => void
}

function SideScoreForm({ side, state, isMySide, onSubmitScores }: SideScoreFormProps) {
  const sideState = state.sides[side]
  const isBlue = side === 'blue'
  const [chambers, setChambers] = useState<ChamberTimeInput[]>(
    () => sideState.chambers ?? DEFAULT_CHAMBERS,
  )

  const diffs = chambers.map((c) => calcChamberDiff(c.minutes, c.seconds))
  const allValid = diffs.every((d) => d !== null)
  const totalChamberDiff = diffs.reduce<number>((sum, d) => sum + (d ?? 0), 0)
  const breakdown = computeCostBreakdown(sideState.picks)
  const milestone = formatCostMilestoneSummary(sideState.totalCost, state.ruleset.costRules)
  const refSec = sideState.weaponRefinementSeconds ?? 0
  const addedSeconds = round2(sideState.costPenaltySeconds + refSec)
  const overtime = round2(sideState.overtimePenaltySeconds ?? 0)
  const totalAddedSeconds = round2(addedSeconds + overtime)
  const projectedTotal = round2(totalAddedSeconds + totalChamberDiff)

  const handleTimeChange = (idx: number, field: 'minutes' | 'seconds', raw: string) => {
    const val = Math.max(0, Number(raw) || 0)
    setChambers((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (field === 'minutes') {
          const m = Math.min(10, val)
          return { minutes: m, seconds: m === 10 ? 0 : item.seconds }
        }
        return { minutes: item.minutes, seconds: item.minutes === 10 ? 0 : Math.min(59, val) }
      }),
    )
  }

  const handleSubmit = () => {
    if (!allValid) {
      toast.error('Thời gian mỗi ải phải từ 00:00 đến tối đa 10:00.')
      return
    }
    onSubmitScores(side, chambers)
  }

  return (
    <section
      data-score-form={side}
      aria-label={isBlue ? 'Nhập kết quả 3 phòng đội Xanh' : 'Nhập kết quả 3 phòng đội Đỏ'}
      className={cn(
        'panel flex flex-col justify-between gap-3 p-4',
        isBlue ? 'border-hydro/45' : 'border-danger/45',
      )}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-extrabold uppercase',
                isBlue ? 'bg-hydro/20 text-hydro' : 'bg-danger/20 text-danger',
              )}
            >
              {isBlue ? 'Đội Xanh' : 'Đội Đỏ'}
            </span>
            <h2 className="text-base font-bold text-text">
              {sideState.player?.displayName ?? '—'}
            </h2>
            {isMySide && (
              <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-strong">
                Bạn
              </span>
            )}
            {sideState.scoreSubmitted && (
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success">
                Đã nộp
              </span>
            )}
          </div>
          <span className="font-mono text-xs font-bold text-gold-strong">
            +{totalChamberDiff}s (3 phòng)
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Mốc 10:00 / phòng (tính <code className="text-text">10:00 − thời gian nhập</code>).
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {chambers.map((ch, idx) => {
            const diff = diffs[idx]
            return (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-bg/50 px-2.5 py-2 sm:px-3"
              >
                <span className="min-w-12 text-xs font-bold text-text sm:min-w-16">
                  Phòng {idx + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    <span>Phút</span>
                    <input
                      type="number"
                      aria-label={`Phút phòng ${idx + 1}`}
                      min={0}
                      max={10}
                      value={ch.minutes}
                      onChange={(e) => handleTimeChange(idx, 'minutes', e.target.value)}
                      className="h-10 w-14 rounded-lg border border-line bg-panel px-1.5 text-center font-mono text-base text-text focus:border-gold focus:outline-none sm:text-sm xl:h-8 xl:px-2"
                    />
                  </label>
                  <span className="font-mono text-sm font-bold text-muted">:</span>
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    <span>Giây</span>
                    <input
                      type="number"
                      aria-label={`Giây phòng ${idx + 1}`}
                      min={0}
                      max={59}
                      value={ch.seconds}
                      onChange={(e) => handleTimeChange(idx, 'seconds', e.target.value)}
                      className="h-10 w-14 rounded-lg border border-line bg-panel px-1.5 text-center font-mono text-base text-text focus:border-gold focus:outline-none sm:text-sm xl:h-8 xl:px-2"
                    />
                  </label>
                </div>
                <span
                  className={cn(
                    'min-w-12 text-right font-mono text-xs font-bold sm:min-w-16',
                    diff !== null ? 'text-gold-strong' : 'text-danger',
                  )}
                >
                  {diff !== null ? `+${diff}s` : 'Lỗi'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Thông tin Cost & Thời gian của bên này */}
        <div
          aria-label={`Thông tin Cost và Thời gian đội ${isBlue ? 'Xanh' : 'Đỏ'}`}
          className="mt-3 grid grid-cols-2 gap-2 text-xs"
        >
          <div className="rounded-xl border border-line bg-bg/55 p-2.5">
            <div className="text-[11px] font-medium text-muted">Cost</div>
            <div className="mt-0.5 font-mono text-base font-extrabold text-gold-strong">
              {formatCost(sideState.totalCost)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              NV {formatCost(breakdown.characterCost)} · VK {formatCost(breakdown.weaponCost)}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-bg/55 p-2.5">
            <div className="text-[11px] font-medium text-muted">Mốc cost hiện tại</div>
            <div className="mt-0.5 font-mono text-base font-extrabold text-text">
              {milestone.rangeLabel}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">{milestone.rateLabel}</div>
          </div>

          <div className="rounded-xl border border-line bg-bg/55 p-2.5">
            <div className="text-[11px] font-medium text-muted">Thời gian cộng thêm</div>
            <div className="mt-0.5 font-mono text-base font-extrabold text-gold-strong">
              +{formatSeconds(addedSeconds)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {refSec > 0
                ? `Cost +${formatSeconds(sideState.costPenaltySeconds)} · Tinh luyện +${formatSeconds(refSec)}`
                : 'Quy đổi từ Cost'}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-bg/55 p-2.5">
            <div className="text-[11px] font-medium text-muted">Thời gian bị phạt</div>
            <div
              className={cn(
                'mt-0.5 font-mono text-base font-extrabold',
                overtime > 0 ? 'text-danger' : 'text-text',
              )}
            >
              {overtime > 0 ? `+${formatSeconds(overtime)}` : '0s'}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">Quá giờ Ban/Pick</div>
          </div>

          <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-strong">
              Tổng thời gian cộng thêm
            </span>
            <span className="font-mono text-base font-black text-gold-strong">
              +{formatSeconds(totalAddedSeconds)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3.5 py-2.5">
        <div className="text-xs sm:text-sm">
          <div className="text-muted">
            Tổng 3 phòng: <strong className="text-text">+{totalChamberDiff}s</strong>
          </div>
          <div>
            Tổng điểm dự kiến:{' '}
            <strong className="text-gold-strong">{formatSeconds(projectedTotal)}</strong>
          </div>
        </div>
        <Button variant="primary" size="sm" disabled={!allValid} onClick={handleSubmit}>
          {sideState.scoreSubmitted
            ? `Cập nhật Đội ${isBlue ? 'Xanh' : 'Đỏ'}`
            : `Xác nhận Đội ${isBlue ? 'Xanh' : 'Đỏ'}`}
        </Button>
      </div>
    </section>
  )
}

export function MatchScoringPhase({ state, mySide, isAdmin = false, onSubmitScores }: Props) {
  const canSubmitScores = state.status === 'scoring' && (isAdmin || mySide !== null)

  const lastGame = state.gameHistory?.[state.gameHistory.length - 1] ?? null
  const isBo3 = state.format === 'bo3'
  const blueSeriesWins = getSeriesWinsForSide(state, 'blue')
  const redSeriesWins = getSeriesWinsForSide(state, 'red')
  const lastWinReasonText = formatWinReason(state.lastGameWinReason)

  const renderScoreCard = (side: MatchSide) => {
    const s = state.sides[side]
    const isBlue = side === 'blue'
    const isWinner =
      state.status === 'between_games'
        ? lastGame?.winnerSide === side
        : state.status === 'finished'
          ? isBo3
            ? lastGame?.winnerSide === side
            : state.winnerSide === side
          : false
    const refSec = s.weaponRefinementSeconds ?? 0
    const overtimeSec = s.overtimePenaltySeconds ?? 0
    const fourStarCount = countFourStarPicks(s.picks)
    const activeWinReason =
      state.status === 'between_games' ? lastGame?.winReason : state.lastGameWinReason
    const isForfeitCard =
      !s.scoreSubmitted &&
      (state.status === 'finished' || state.status === 'between_games') &&
      activeWinReason === 'forfeit_timeout'

    return (
      <section
        className={cn(
          'panel flex flex-col gap-3 p-4',
          isBlue ? 'border-hydro/40' : 'border-danger/40',
          isWinner && 'ring-2 ring-gold',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-extrabold', isBlue ? 'text-hydro' : 'text-danger')}>
                {isBlue ? 'Đội Xanh Dương (Trái)' : 'Đội Đỏ (Phải)'}
              </span>
              {isWinner && (
                <span className="rounded bg-gold/25 px-2 py-0.5 text-xs font-extrabold text-gold-strong">
                  CHIẾN THẮNG
                </span>
              )}
            </div>
            <div className="text-base font-bold text-text">{s.player?.displayName ?? '—'}</div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[11px] text-muted">
              Cost: {formatCost(s.totalCost)} (+{formatSeconds(s.costPenaltySeconds)})
              {' · '}
              <span>4★: {fourStarCount} NV</span>
              {refSec > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-pyro">Tinh luyện: +{formatSeconds(refSec)}</span>
                </>
              )}
              {overtimeSec > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-danger">Phạt giờ: +{formatSeconds(overtimeSec)}</span>
                </>
              )}
            </div>
            {s.scoreSubmitted && s.finalScore !== null ? (
              <div className="text-xl font-extrabold text-gold-strong">
                Tổng: {formatSeconds(s.finalScore)}
              </div>
            ) : isForfeitCard ? (
              <div className={cn('text-sm font-extrabold', isWinner ? 'text-success' : 'text-danger')}>
                {isWinner ? 'Thắng (đối thủ quá giờ)' : 'Bị xử thua (quá giờ)'}
              </div>
            ) : (
              <div className="text-xs text-muted">Chưa nộp thời gian</div>
            )}
          </div>
        </div>

        {s.scoreSubmitted && s.chambers && s.chamberDiffs ? (
          <div className="rounded-lg border border-line bg-bg/60 p-3 text-xs">
            <div className="mb-1.5 font-semibold text-muted">
              Chi tiết điểm 3 ải (10:00 − thời gian nhập)
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {s.chambers.map((ch, idx) => (
                <div key={idx} className="rounded bg-panel-2 p-2">
                  <div className="text-[11px] text-muted">Ải {idx + 1}</div>
                  <div className="font-mono text-text">
                    {String(ch.minutes).padStart(2, '0')}:{String(ch.seconds).padStart(2, '0')}
                  </div>
                  <div className="font-bold text-gold-strong">+{s.chamberDiffs?.[idx]}s</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 font-semibold">
              <span>
                Điểm Cost ({formatSeconds(s.costPenaltySeconds)})
                {refSec > 0 ? ` + Tinh luyện (${formatSeconds(refSec)})` : ''}
                {overtimeSec > 0 ? ` + Phạt giờ (${formatSeconds(overtimeSec)})` : ''} + 3 ải ({s.chamberTotalSeconds}s)
              </span>
              <span className="text-sm text-gold-strong">= {formatSeconds(s.finalScore ?? 0)}</span>
            </div>
          </div>
        ) : isForfeitCard ? (
          <p className={cn('py-4 text-center text-xs font-semibold', isWinner ? 'text-success' : 'text-danger')}>
            {isWinner
              ? 'Đối thủ đã âm thời gian vượt giới hạn — bạn được xử thắng.'
              : 'Đã âm thời gian vượt giới hạn — bị xử thua.'}
          </p>
        ) : (
          <p className="py-4 text-center text-xs text-muted">
            Đang chờ người chơi nhập thời gian hoàn thành 3 ải…
          </p>
        )}

        {s.picks.some((p) => p.characterCustomCostNote || p.weaponCustomCostNote) && (
          <div className="rounded-lg border border-hydro/35 bg-hydro/5 px-3 py-2 text-[11px]">
            <div className="mb-1 font-bold text-hydro">Custom Cost đang áp dụng:</div>
            <ul className="space-y-0.5 text-text">
              {s.picks.flatMap((p) => {
                const items: string[] = []
                if (p.characterCustomCostNote) {
                  const chName = getCharacter(p.characterSlug)?.name ?? p.characterSlug
                  items.push(
                    `• ${chName} (C${p.constellation} · ${formatCost(p.characterCost)} cost): ${p.characterCustomCostNote}`,
                  )
                }
                if (p.weaponCustomCostNote && p.weaponSlug) {
                  const wpName = getWeapon(p.weaponSlug)?.name ?? p.weaponSlug
                  items.push(
                    `• ${wpName} (R${p.refinement} · ${formatCost(p.weaponCost)} cost): ${p.weaponCustomCostNote}`,
                  )
                }
                return items.map((line, i) => <li key={`${p.slot}-${i}`}>{line}</li>)
              })}
            </ul>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'finished' && (
        <section className="panel border-gold/50 bg-gradient-to-r from-gold/15 via-panel to-gold/15 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-gold">
            {isBo3 ? 'Kết quả chung cuộc BO3' : 'Kết quả chung cuộc'}
          </div>
          <h2 className="mt-1 text-2xl font-extrabold text-gold-strong sm:text-3xl">
            {state.winnerSide === 'blue'
              ? `Đội Xanh Dương (${state.sides.blue.player?.displayName}) Chiến Thắng!`
              : state.winnerSide === 'red'
                ? `Đội Đỏ (${state.sides.red.player?.displayName}) Chiến Thắng!`
                : isBo3
                  ? 'Hai đội Hòa nhau sau 3 ván!'
                  : 'Hai đội Hòa điểm!'}
          </h2>
          {isBo3 ? (
            <div className="mt-2 flex flex-col items-center gap-1">
              <div className="font-mono text-xl font-black">
                <span className="text-hydro">{blueSeriesWins}</span>
                <span className="mx-2 text-muted">-</span>
                <span className="text-danger">{redSeriesWins}</span>
              </div>
              {lastWinReasonText && (
                <p className="text-xs font-semibold text-gold-strong">
                  Ván cuối: {lastWinReasonText}
                </p>
              )}
            </div>
          ) : state.lastGameWinReason === 'forfeit_timeout' ? (
            lastWinReasonText && (
              <p className="mt-2 text-sm font-semibold text-gold-strong">{lastWinReasonText}</p>
            )
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">
                Xanh: <strong className="text-hydro">{formatSeconds(state.sides.blue.finalScore ?? 0)}</strong> · Đỏ:{' '}
                <strong className="text-danger">{formatSeconds(state.sides.red.finalScore ?? 0)}</strong> (người có ít điểm nhất giành chiến thắng)
              </p>
              {lastWinReasonText && (
                <p className="mt-1 text-xs font-semibold text-gold-strong">{lastWinReasonText}</p>
              )}
            </>
          )}
          <div className="mt-4">
            <Link to="/lobby" className={buttonClass('primary', 'md')}>
              Quay lại Tạo trận mới
            </Link>
          </div>
        </section>
      )}

      {state.status === 'finished' && isBo3 && (state.gameHistory?.length ?? 0) > 0 && (
        <section className="panel border-line/80 p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gold-strong">
            Tổng kết các ván trong loạt BO3
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            {state.gameHistory?.map((g) => {
              const reasonText = formatWinReason(g.winReason)
              return (
                <div
                  key={g.gameNumber}
                  className="rounded-xl border border-line bg-bg/55 p-3 text-xs"
                >
                  <div className="mb-2 flex items-center justify-between border-b border-line/60 pb-1.5">
                    <span className="font-extrabold text-gold-strong">Ván {g.gameNumber}</span>
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-bold',
                        g.winnerSide === 'blue'
                          ? 'bg-hydro/20 text-hydro'
                          : g.winnerSide === 'red'
                            ? 'bg-danger/20 text-danger'
                            : 'bg-panel-2 text-muted',
                      )}
                    >
                      {g.winnerSide === 'blue'
                        ? `${g.blue.player?.displayName ?? 'Xanh'} thắng`
                        : g.winnerSide === 'red'
                          ? `${g.red.player?.displayName ?? 'Đỏ'} thắng`
                          : 'Hòa'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-hydro">{g.blue.player?.displayName ?? 'Xanh'}</span>
                      <span className="font-mono font-bold text-text">
                        {g.winReason === 'forfeit_timeout' && g.blue.finalScore === null
                          ? g.winnerSide === 'blue'
                            ? 'Thắng (xử thua)'
                            : 'Bị xử thua'
                          : `${formatSeconds(g.blue.finalScore ?? 0)} (Cost ${formatCost(g.blue.totalCost)} · ${g.blue.fourStarCount}★4)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-danger">{g.red.player?.displayName ?? 'Đỏ'}</span>
                      <span className="font-mono font-bold text-text">
                        {g.winReason === 'forfeit_timeout' && g.red.finalScore === null
                          ? g.winnerSide === 'red'
                            ? 'Thắng (xử thua)'
                            : 'Bị xử thua'
                          : `${formatSeconds(g.red.finalScore ?? 0)} (Cost ${formatCost(g.red.totalCost)} · ${g.red.fourStarCount}★4)`}
                      </span>
                    </div>
                  </div>
                  {reasonText && (
                    <div className="mt-1.5 text-[11px] font-medium text-gold">{reasonText}</div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {canSubmitScores && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line/70 bg-bg/60 px-3.5 py-2 text-xs text-muted">
            Admin và cả 2 người chơi đều có thể nhập hoặc cập nhật thời gian hoàn thành 3 phòng cho cả 2 bên.
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(['blue', 'red'] as const).map((side) => (
              <SideScoreForm
                key={`${side}-${state.currentGame ?? 1}-${JSON.stringify(state.sides[side].chambers)}`}
                side={side}
                state={state}
                isMySide={mySide === side}
                onSubmitScores={onSubmitScores}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
        {renderScoreCard('blue')}
        {renderScoreCard('red')}
      </div>
    </div>
  )
}
