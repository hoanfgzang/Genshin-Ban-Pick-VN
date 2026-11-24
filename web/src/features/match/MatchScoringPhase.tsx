import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { toast } from '@/components/ui/toast'
import { calcChamberDiff, formatCost, formatSeconds } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { ChamberTimeInput, MatchState } from '@/services'
import { countFourStarPicks, formatWinReason, getSeriesWinsForSide } from './series'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  onSubmitScores: (chambers: ChamberTimeInput[]) => void
}

const DEFAULT_CHAMBERS: ChamberTimeInput[] = [
  { minutes: 8, seconds: 0 },
  { minutes: 8, seconds: 0 },
  { minutes: 8, seconds: 0 },
]

export function MatchScoringPhase({ state, mySide, onSubmitScores }: Props) {
  const myInitialChambers = mySide ? state.sides[mySide].chambers : null
  const [chambers, setChambers] = useState<ChamberTimeInput[]>(
    () => myInitialChambers ?? DEFAULT_CHAMBERS,
  )

  const diffs = chambers.map((c) => calcChamberDiff(c.minutes, c.seconds))
  const allValid = diffs.every((d) => d !== null)
  const totalChamberDiff = diffs.reduce<number>((sum, d) => sum + (d ?? 0), 0)
  const myRefSec = mySide ? (state.sides[mySide].weaponRefinementSeconds ?? 0) : 0
  const myOvertime = mySide ? (state.sides[mySide].overtimePenaltySeconds ?? 0) : 0
  const myProjectedTotal = mySide
    ? state.sides[mySide].costPenaltySeconds + myRefSec + myOvertime + totalChamberDiff
    : 0

  const handleTimeChange = (idx: number, field: 'minutes' | 'seconds', raw: string) => {
    const val = Math.max(0, Number(raw) || 0)
    setChambers((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (field === 'minutes') {
          const m = Math.min(9, val)
          return { minutes: m, seconds: m === 9 ? 0 : item.seconds }
        }
        return { minutes: item.minutes, seconds: item.minutes === 9 ? 0 : Math.min(59, val) }
      }),
    )
  }

  const handleSubmit = () => {
    if (!allValid) {
      toast.error('Thời gian mỗi ải phải từ 00:00 đến tối đa 09:00.')
      return
    }
    onSubmitScores(chambers)
  }

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

    return (
      <section
        className={cn(
          'panel flex flex-col gap-3 p-4',
          isBlue ? 'border-hydro/40' : 'border-danger/40',
          isWinner && 'ring-2 ring-gold',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2.5">
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

          <div className="text-right">
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
            ) : (
              <div className="text-xs text-muted">Chưa nộp thời gian</div>
            )}
          </div>
        </div>

        {s.scoreSubmitted && s.chambers && s.chamberDiffs ? (
          <div className="rounded-lg border border-line bg-bg/60 p-3 text-xs">
            <div className="mb-1.5 font-semibold text-muted">
              Chi tiết điểm 3 ải (09:00 − thời gian nhập)
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
        ) : (
          <p className="py-4 text-center text-xs text-muted">
            Đang chờ người chơi nhập thời gian hoàn thành 3 ải…
          </p>
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
                        {formatSeconds(g.blue.finalScore ?? 0)} (Cost {formatCost(g.blue.totalCost)} · {g.blue.fourStarCount}★4)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-danger">{g.red.player?.displayName ?? 'Đỏ'}</span>
                      <span className="font-mono font-bold text-text">
                        {formatSeconds(g.red.finalScore ?? 0)} (Cost {formatCost(g.red.totalCost)} · {g.red.fourStarCount}★4)
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

      {state.status === 'scoring' && mySide && (
        <section className="panel border-gold/40 p-5">
          <h2 className="text-lg font-bold text-gold-strong">Nhập thời gian hoàn thành 3 ải</h2>
          <p className="mt-1 text-xs text-muted">
            Mỗi ải cố định mốc <strong className="text-text">09:00 (540 giây)</strong>. Hệ thống sẽ lấy{' '}
            <code>09:00 − thời gian bạn nhập</code> ở cả 3 ô rồi cộng vào Điểm Cost của đội bạn.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {chambers.map((ch, idx) => {
              const diff = diffs[idx]
              return (
                <div key={idx} className="rounded-xl border border-line bg-bg/50 p-3.5">
                  <div className="mb-2 flex items-center justify-between text-sm font-bold">
                    <span>Ải {idx + 1}</span>
                    <span className="text-gold-strong">
                      {diff !== null
                        ? `9:00 − ${String(ch.minutes).padStart(2, '0')}:${String(ch.seconds).padStart(2, '0')} = +${diff}s`
                        : 'Không hợp lệ'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      <span>Phút (0–9)</span>
                      <input
                        type="number"
                        min={0}
                        max={9}
                        value={ch.minutes}
                        onChange={(e) => handleTimeChange(idx, 'minutes', e.target.value)}
                        className="h-9 rounded-lg border border-line bg-panel px-2.5 text-center font-mono text-sm text-text focus:border-gold focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      <span>Giây (0–59)</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={ch.seconds}
                        onChange={(e) => handleTimeChange(idx, 'seconds', e.target.value)}
                        className="h-9 rounded-lg border border-line bg-panel px-2.5 text-center font-mono text-sm text-text focus:border-gold focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
            <div className="text-sm">
              Tổng điểm dự kiến:{' '}
              <strong className="text-gold-strong">
                +{formatSeconds(state.sides[mySide].costPenaltySeconds)} (Cost)
                {myRefSec > 0 ? ` + ${formatSeconds(myRefSec)} (Tinh luyện)` : ''}
                {myOvertime > 0 ? ` + ${formatSeconds(myOvertime)} (Phạt giờ)` : ''} + {totalChamberDiff}s (3 ải) ={' '}
                {formatSeconds(myProjectedTotal)}
              </strong>
            </div>
            <Button variant="primary" disabled={!allValid} onClick={handleSubmit}>
              {state.sides[mySide].scoreSubmitted ? 'Cập nhật lại kết quả' : 'Xác nhận kết quả 3 ải'}
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {renderScoreCard('blue')}
        {renderScoreCard('red')}
      </div>
    </div>
  )
}
