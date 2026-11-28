import { computeCostBreakdown } from './lineup'
import { getSeriesWinsForSide } from './series'
import { formatCost, formatSeconds, round2 } from '@/domain/cost'
import { getStepBaseSeconds, type MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState } from '@/services'

interface Props {
  state: MatchState
  countdown: number | null
}

const PHASE_TITLE: Record<MatchState['status'], string> = {
  lobby: 'PHÒNG CHỜ',
  drafting: 'DRAFT',
  weapon_phase: 'ĐỘI HÌNH & VŨ KHÍ',
  scoring: 'TÍNH ĐIỂM 3 ẢI',
  between_games: 'NGHỈ GIỮA VÁN',
  finished: 'KẾT QUẢ',
}

function formatClock(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const isNegative = seconds < 0
  const abs = Math.abs(Math.trunc(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${isNegative ? '-' : ''}${m}:${String(s).padStart(2, '0')}`
}

export function MatchScoreboardHeader({ state, countdown }: Props) {
  const activeStep =
    state.status === 'drafting' ? state.ruleset.draftSteps[state.currentStepIndex] ?? null : null
  const blueCosts = computeCostBreakdown(state.sides.blue.picks)
  const redCosts = computeCostBreakdown(state.sides.red.picks)
  const blueRefSec = state.sides.blue.weaponRefinementSeconds ?? blueCosts.weaponRefinementSeconds
  const redRefSec = state.sides.red.weaponRefinementSeconds ?? redCosts.weaponRefinementSeconds

  const blueReadyDone =
    (state.status === 'weapon_phase' && state.sides.blue.weaponsLocked) ||
    ((state.status === 'scoring' || state.status === 'finished') && state.sides.blue.scoreSubmitted)
  const redReadyDone =
    (state.status === 'weapon_phase' && state.sides.red.weaponsLocked) ||
    ((state.status === 'scoring' || state.status === 'finished') && state.sides.red.scoreSubmitted)

  const blueActive = activeStep?.side === 'blue' || (state.status === 'weapon_phase' && !state.sides.blue.weaponsLocked)
  const redActive = activeStep?.side === 'red' || (state.status === 'weapon_phase' && !state.sides.red.weaponsLocked)

  const renderStatusIcon = (side: MatchSide, done: boolean, active: boolean) => {
    const isBlue = side === 'blue'
    if (done) {
      return (
        <span
          title="Đã hoàn tất"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-success/60 bg-success/15 text-success"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )
    }
    return (
      <span
        title={active ? 'Đang tới lượt' : 'Đang chờ'}
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full border transition',
          active
            ? isBlue
              ? 'border-hydro bg-hydro/15 text-hydro animate-pulse'
              : 'border-danger bg-danger/15 text-danger animate-pulse'
            : 'border-gold/40 bg-gold/10 text-gold',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9 3h6" />
        </svg>
      </span>
    )
  }

  const useReserveTime = Boolean(state.ruleset.useReserveTime)
  const reserveDefault = state.ruleset.reserveTimeSeconds ?? 120
  const blueSavedReserve = state.sides.blue.reserveRemainingSeconds ?? reserveDefault
  const redSavedReserve = state.sides.red.reserveRemainingSeconds ?? reserveDefault

  const maxOvertimeSeconds = state.ruleset.maxOvertimeSeconds ?? 600
  const blueSavedOvertime = state.sides.blue.overtimePenaltySeconds ?? 0
  const redSavedOvertime = state.sides.red.overtimePenaltySeconds ?? 0

  const calcLiveTiming = (side: MatchSide, savedReserve: number, savedOvertime: number) => {
    if (countdown === null || countdown >= 0) {
      return {
        turnDisplay: countdown,
        liveReserve: savedReserve,
        liveOvertime: 0,
        consumingReserve: false,
      }
    }
    const elapsedOver = -countdown
    const capOvertime = (rawOver: number) =>
      maxOvertimeSeconds > 0
        ? Math.min(rawOver, Math.max(0, maxOvertimeSeconds - savedOvertime))
        : rawOver
    if (state.status === 'drafting' && activeStep?.side === side) {
      if (useReserveTime) {
        const liveReserve = Math.max(0, savedReserve - elapsedOver)
        const liveOvertime = capOvertime(Math.max(0, elapsedOver - savedReserve))
        return {
          turnDisplay: liveReserve > 0 ? 0 : -liveOvertime,
          liveReserve,
          liveOvertime,
          consumingReserve: liveReserve > 0,
        }
      }
      const liveOvertime = capOvertime(elapsedOver)
      return {
        turnDisplay: -liveOvertime,
        liveReserve: savedReserve,
        liveOvertime,
        consumingReserve: false,
      }
    }
    if (state.status === 'weapon_phase') {
      return {
        turnDisplay: Math.max(0, countdown),
        liveReserve: savedReserve,
        liveOvertime: 0,
        consumingReserve: false,
      }
    }
    return {
      turnDisplay: countdown,
      liveReserve: savedReserve,
      liveOvertime: 0,
      consumingReserve: false,
    }
  }

  const blueTiming = calcLiveTiming('blue', blueSavedReserve, blueSavedOvertime)
  const redTiming = calcLiveTiming('red', redSavedReserve, redSavedOvertime)

  const blueTotalOvertime = blueSavedOvertime + blueTiming.liveOvertime
  const redTotalOvertime = redSavedOvertime + redTiming.liveOvertime
  const isBo3 = state.format === 'bo3'
  const winsToWin = state.winsToWin ?? 2
  const blueSeriesWins = getSeriesWinsForSide(state, 'blue')
  const redSeriesWins = getSeriesWinsForSide(state, 'red')

  const getWaitingSideTurnSeconds = (side: MatchSide): number => {
    const nextSideStep = state.ruleset.draftSteps
      .slice(state.currentStepIndex)
      .find((s) => s.side === side)
    if (nextSideStep) return getStepBaseSeconds(state.ruleset, nextSideStep)
    return state.ruleset.pickSeconds ?? state.ruleset.perTurnSeconds
  }

  const blueWaitingSec = getWaitingSideTurnSeconds('blue')
  const redWaitingSec = getWaitingSideTurnSeconds('red')

  const blueClock =
    state.status === 'drafting'
      ? activeStep?.side === 'blue'
        ? formatClock(blueTiming.turnDisplay)
        : blueWaitingSec > 0
          ? formatClock(blueWaitingSec)
          : '--:--'
      : state.status === 'weapon_phase'
        ? state.sides.blue.weaponsLocked
          ? 'Đã khóa'
          : formatClock(blueTiming.turnDisplay)
        : state.sides.blue.finalScore !== null
          ? formatSeconds(state.sides.blue.finalScore)
          : state.status === 'finished' && state.lastGameWinReason === 'forfeit_timeout'
            ? state.winnerSide === 'blue'
              ? 'Thắng'
              : 'Xử thua'
            : '—'

  const redClock =
    state.status === 'drafting'
      ? activeStep?.side === 'red'
        ? formatClock(redTiming.turnDisplay)
        : redWaitingSec > 0
          ? formatClock(redWaitingSec)
          : '--:--'
      : state.status === 'weapon_phase'
        ? state.sides.red.weaponsLocked
          ? 'Đã khóa'
          : formatClock(redTiming.turnDisplay)
        : state.sides.red.finalScore !== null
          ? formatSeconds(state.sides.red.finalScore)
          : state.status === 'finished' && state.lastGameWinReason === 'forfeit_timeout'
            ? state.winnerSide === 'red'
              ? 'Thắng'
              : 'Xử thua'
            : '—'

  const clockColorClass = (
    side: MatchSide,
    timing: ReturnType<typeof calcLiveTiming>,
    weaponsLocked: boolean,
  ) =>
    timing.liveOvertime > 0
      ? 'text-danger animate-pulse'
      : timing.consumingReserve
        ? 'text-gold-strong'
        : state.status === 'weapon_phase' && weaponsLocked
          ? 'text-xs font-bold text-success sm:text-sm'
          : activeStep?.side === side
            ? side === 'blue'
              ? 'text-hydro'
              : 'text-danger'
            : 'text-text'

  const blueTotalAdded = round2(
    state.sides.blue.costPenaltySeconds + blueRefSec + blueTotalOvertime,
  )
  const redTotalAdded = round2(
    state.sides.red.costPenaltySeconds + redRefSec + redTotalOvertime,
  )

  return (
    <section
      aria-label="Bảng điểm trận đấu"
      className="panel px-3 py-2.5 sm:px-4 lg:px-5 lg:py-3"
    >
      {/* Mobile (< md): clean 2-row 1v1 scoreboard, no duplicate micro-labels */}
      <div className="md:hidden">
        <div className="grid grid-cols-2 gap-3 border-b border-line/40 pb-2">
          {/* Blue player & single cost summary */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-hydro" aria-hidden="true" />
              <h2 className="truncate text-sm font-bold text-text">
                {state.sides.blue.player?.displayName ?? 'Trống'}
              </h2>
              {isBo3 && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {Array.from({ length: winsToWin }, (_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'size-2 rounded-full border',
                        idx < blueSeriesWins
                          ? 'border-hydro bg-hydro'
                          : 'border-hydro/40 bg-transparent',
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {formatCost(state.sides.blue.totalCost)} cost ·{' '}
              <strong className="font-mono text-gold-strong">
                +{formatSeconds(blueTotalAdded)}
              </strong>
            </div>
          </div>

          {/* Red player & single cost summary */}
          <div className="min-w-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              {isBo3 && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {Array.from({ length: winsToWin }, (_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'size-2 rounded-full border',
                        idx < redSeriesWins
                          ? 'border-danger bg-danger'
                          : 'border-danger/40 bg-transparent',
                      )}
                    />
                  ))}
                </div>
              )}
              <h2 className="truncate text-sm font-bold text-text">
                {state.sides.red.player?.displayName ?? 'Trống'}
              </h2>
              <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {formatCost(state.sides.red.totalCost)} cost ·{' '}
              <strong className="font-mono text-gold-strong">
                +{formatSeconds(redTotalAdded)}
              </strong>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'font-mono text-xl font-extrabold leading-none tabular-nums',
                clockColorClass('blue', blueTiming, state.sides.blue.weaponsLocked),
              )}
            >
              {blueClock}
            </span>
            {useReserveTime &&
              (state.status === 'drafting' || state.status === 'weapon_phase') && (
                <span
                  className={cn(
                    'font-mono text-xs tabular-nums',
                    blueTiming.consumingReserve
                      ? 'font-bold text-gold-strong'
                      : blueTiming.liveReserve <= 0
                        ? 'font-bold text-danger'
                        : 'text-muted',
                  )}
                >
                  Gốc {formatClock(blueTiming.liveReserve)}
                </span>
              )}
          </div>

          <div className="px-1 text-center">
            {isBo3 && (
              <div className="text-[11px] font-bold tracking-wider text-gold uppercase">
                BO3 · V{state.currentGame ?? 1}/{state.maxGames ?? 3}
              </div>
            )}
            <div className="text-xs font-extrabold tracking-wider text-gold-strong sm:text-sm">
              {PHASE_TITLE[state.status]}
            </div>
            {state.status === 'drafting' && activeStep && (
              <div className="text-xs text-muted">
                Bước {state.currentStepIndex + 1}/{state.ruleset.draftSteps.length}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-end gap-1.5 text-right">
            {useReserveTime &&
              (state.status === 'drafting' || state.status === 'weapon_phase') && (
                <span
                  className={cn(
                    'font-mono text-xs tabular-nums',
                    redTiming.consumingReserve
                      ? 'font-bold text-gold-strong'
                      : redTiming.liveReserve <= 0
                        ? 'font-bold text-danger'
                        : 'text-muted',
                  )}
                >
                  Gốc {formatClock(redTiming.liveReserve)}
                </span>
              )}
            <span
              className={cn(
                'font-mono text-xl font-extrabold leading-none tabular-nums',
                clockColorClass('red', redTiming, state.sides.red.weaponsLocked),
              )}
            >
              {redClock}
            </span>
          </div>
        </div>
      </div>

      {/* iPad (md..lg): clean 3-column header */}
      <div className="hidden items-center gap-2 md:grid md:grid-cols-[1fr_auto_1fr] xl:hidden">
        {/* Bên Trái - Blue */}
        <div className="flex min-w-0 items-center justify-end gap-2 lg:gap-3">
          <div className="hidden lg:block">{renderStatusIcon('blue', blueReadyDone, blueActive)}</div>
          <div className="min-w-0 text-right">
            <div className="flex items-center justify-end gap-1.5 lg:gap-2">
              {isBo3 && (
                <div className="flex items-center gap-1" title={`Tỷ số BO3: ${blueSeriesWins} thắng`}>
                  {Array.from({ length: winsToWin }, (_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'size-2.5 rounded-full border',
                        idx < blueSeriesWins
                          ? 'border-hydro bg-hydro shadow-[0_0_8px_rgba(76,194,241,0.6)]'
                          : 'border-hydro/40 bg-transparent',
                      )}
                    />
                  ))}
                  <span className="ml-0.5 font-mono text-xs font-extrabold text-hydro">
                    {blueSeriesWins}
                  </span>
                </div>
              )}
              <span className="rounded bg-hydro/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-hydro">
                Blue
              </span>
              <h2 className="truncate text-sm font-extrabold uppercase tracking-wide text-text lg:text-base">
                {state.sides.blue.player?.displayName ?? 'Trống'}
              </h2>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs text-muted">
              <span>
                NV <strong className="text-text">{formatCost(blueCosts.characterCost)}</strong> · VK{' '}
                <strong className="text-text">{formatCost(blueCosts.weaponCost)}</strong>
              </span>
              <span>·</span>
              <span className="font-semibold text-gold-strong">
                +{formatSeconds(state.sides.blue.costPenaltySeconds)}
              </span>
              {blueRefSec > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-pyro">
                    TL +{formatSeconds(blueRefSec)}
                  </span>
                </>
              )}
              {blueTotalOvertime > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-danger">
                    Phạt +{formatSeconds(blueTotalOvertime)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Trung tâm - Timer & Tên pha */}
        <div className="flex items-center justify-center gap-2 px-1 lg:gap-4 lg:px-4">
          <div className="min-w-14 text-center lg:min-w-20">
            <div
              className={cn(
                'font-mono text-xl font-extrabold tabular-nums lg:text-2xl',
                clockColorClass('blue', blueTiming, state.sides.blue.weaponsLocked),
              )}
            >
              {blueClock}
            </div>
            {useReserveTime && (state.status === 'drafting' || state.status === 'weapon_phase') && (
              <div
                className={cn(
                  'mt-0.5 font-mono text-[11px] font-bold tabular-nums',
                  blueTiming.consumingReserve
                    ? 'text-gold-strong animate-pulse'
                    : blueTiming.liveReserve <= 0
                      ? 'text-danger'
                      : 'text-muted',
                )}
                title="Thời gian gốc còn lại"
              >
                Gốc {formatClock(blueTiming.liveReserve)}
              </div>
            )}
            <div className="text-xs font-semibold text-muted">
              Cost {formatCost(state.sides.blue.totalCost)}
            </div>
          </div>

          <div className="text-center">
            {isBo3 && (
              <div className="mb-0.5 text-[11px] font-extrabold tracking-widest text-gold uppercase">
                BO3 · VÁN {state.currentGame ?? 1}/{state.maxGames ?? 3}
              </div>
            )}
            <div className="text-base font-black tracking-wider text-gold-strong lg:text-xl">
              {PHASE_TITLE[state.status]}
            </div>
            {state.status === 'drafting' && activeStep && (
              <div className="text-xs font-semibold text-muted">
                Bước {state.currentStepIndex + 1}/{state.ruleset.draftSteps.length}
              </div>
            )}
          </div>

          <div className="min-w-14 text-center lg:min-w-20">
            <div
              className={cn(
                'font-mono text-xl font-extrabold tabular-nums lg:text-2xl',
                clockColorClass('red', redTiming, state.sides.red.weaponsLocked),
              )}
            >
              {redClock}
            </div>
            {useReserveTime && (state.status === 'drafting' || state.status === 'weapon_phase') && (
              <div
                className={cn(
                  'mt-0.5 font-mono text-[11px] font-bold tabular-nums',
                  redTiming.consumingReserve
                    ? 'text-gold-strong animate-pulse'
                    : redTiming.liveReserve <= 0
                      ? 'text-danger'
                      : 'text-muted',
                )}
                title="Thời gian gốc còn lại"
              >
                Gốc {formatClock(redTiming.liveReserve)}
              </div>
            )}
            <div className="text-xs font-semibold text-muted">
              Cost {formatCost(state.sides.red.totalCost)}
            </div>
          </div>
        </div>

        {/* Bên Phải - Red */}
        <div className="flex min-w-0 items-center justify-start gap-2.5 lg:gap-3">
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5 lg:gap-2">
              <h2 className="truncate text-sm font-extrabold uppercase tracking-wide text-text lg:text-base">
                {state.sides.red.player?.displayName ?? 'Trống'}
              </h2>
              <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-danger">
                Red
              </span>
              {isBo3 && (
                <div className="flex items-center gap-1" title={`Tỷ số BO3: ${redSeriesWins} thắng`}>
                  <span className="mr-0.5 font-mono text-xs font-extrabold text-danger">
                    {redSeriesWins}
                  </span>
                  {Array.from({ length: winsToWin }, (_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'size-2.5 rounded-full border',
                        idx < redSeriesWins
                          ? 'border-danger bg-danger shadow-[0_0_8px_rgba(239,107,107,0.6)]'
                          : 'border-danger/40 bg-transparent',
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span>
                NV <strong className="text-text">{formatCost(redCosts.characterCost)}</strong> · VK{' '}
                <strong className="text-text">{formatCost(redCosts.weaponCost)}</strong>
              </span>
              <span>·</span>
              <span className="font-semibold text-gold-strong">
                +{formatSeconds(state.sides.red.costPenaltySeconds)}
              </span>
              {redRefSec > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-pyro">
                    TL +{formatSeconds(redRefSec)}
                  </span>
                </>
              )}
              {redTotalOvertime > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-danger">
                    Phạt +{formatSeconds(redTotalOvertime)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="hidden lg:block">{renderStatusIcon('red', redReadyDone, redActive)}</div>
        </div>
      </div>

      {/* Desktop (>= xl): exact original HEAD 3-column scoreboard */}
      <div className="hidden items-center gap-3 xl:grid xl:grid-cols-[1fr_auto_1fr]">
        {/* Bên Trái - Blue */}
        <div className="flex items-center justify-end gap-3">
          <div>{renderStatusIcon('blue', blueReadyDone, blueActive)}</div>
          <div className="min-w-0 text-right">
            <div className="flex items-center justify-end gap-2">
              {isBo3 && (
                <div className="flex items-center gap-1" title={`Tỷ số BO3: ${blueSeriesWins} thắng`}>
                  {Array.from({ length: winsToWin }, (_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'size-2.5 rounded-full border',
                        idx < blueSeriesWins
                          ? 'border-hydro bg-hydro shadow-[0_0_8px_rgba(76,194,241,0.6)]'
                          : 'border-hydro/40 bg-transparent',
                      )}
                    />
                  ))}
                  <span className="ml-0.5 font-mono text-xs font-extrabold text-hydro">
                    {blueSeriesWins}
                  </span>
                </div>
              )}
              <span className="rounded bg-hydro/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-hydro">
                Blue
              </span>
              <h2 className="truncate text-lg font-extrabold uppercase tracking-wide text-text">
                {state.sides.blue.player?.displayName ?? 'Trống'}
              </h2>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 text-xs text-muted">
              <span>
                Cost nhân vật: <strong className="text-text">{formatCost(blueCosts.characterCost)}</strong>
              </span>
              <span>·</span>
              <span>
                Cost vũ khí: <strong className="text-text">{formatCost(blueCosts.weaponCost)}</strong>
              </span>
              <span>·</span>
              <span className="font-semibold text-gold-strong">
                +{formatSeconds(state.sides.blue.costPenaltySeconds)}
              </span>
              {blueRefSec > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-pyro">
                    Tinh luyện +{formatSeconds(blueRefSec)}
                  </span>
                </>
              )}
              {blueTotalOvertime > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-danger">
                    Phạt giờ +{formatSeconds(blueTotalOvertime)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Trung tâm - Timer & Tên pha */}
        <div className="flex items-center justify-center gap-4 px-4">
          <div className="min-w-20 text-center">
            <div
              className={cn(
                'font-mono text-2xl font-extrabold',
                blueTiming.liveOvertime > 0
                  ? 'text-danger animate-pulse'
                  : blueTiming.consumingReserve
                    ? 'text-gold-strong'
                    : state.status === 'weapon_phase' && state.sides.blue.weaponsLocked
                      ? 'text-sm font-bold text-success'
                      : activeStep?.side === 'blue'
                        ? 'text-hydro'
                        : 'text-text',
              )}
            >
              {blueClock}
            </div>
            {useReserveTime && (state.status === 'drafting' || state.status === 'weapon_phase') && (
              <div
                className={cn(
                  'mt-0.5 font-mono text-[10px] font-bold',
                  blueTiming.consumingReserve
                    ? 'text-gold-strong animate-pulse'
                    : blueTiming.liveReserve <= 0
                      ? 'text-danger'
                      : 'text-muted',
                )}
                title="Thời gian gốc còn lại"
              >
                Gốc {formatClock(blueTiming.liveReserve)}
              </div>
            )}
            <div className="text-[11px] font-semibold text-muted">
              Cost {formatCost(state.sides.blue.totalCost)}
            </div>
          </div>

          <div className="text-center">
            {isBo3 && (
              <div className="mb-0.5 text-[10px] font-extrabold tracking-widest text-gold uppercase">
                BO3 · VÁN {state.currentGame ?? 1}/{state.maxGames ?? 3}
              </div>
            )}
            <div className="text-2xl font-black tracking-wider text-gold-strong">
              {PHASE_TITLE[state.status]}
            </div>
            {state.status === 'drafting' && activeStep && (
              <div className="text-[11px] font-semibold text-muted">
                Bước {state.currentStepIndex + 1}/{state.ruleset.draftSteps.length}
              </div>
            )}
          </div>

          <div className="min-w-20 text-center">
            <div
              className={cn(
                'font-mono text-2xl font-extrabold',
                redTiming.liveOvertime > 0
                  ? 'text-danger animate-pulse'
                  : redTiming.consumingReserve
                    ? 'text-gold-strong'
                    : state.status === 'weapon_phase' && state.sides.red.weaponsLocked
                      ? 'text-sm font-bold text-success'
                      : activeStep?.side === 'red'
                        ? 'text-danger'
                        : 'text-text',
              )}
            >
              {redClock}
            </div>
            {useReserveTime && (state.status === 'drafting' || state.status === 'weapon_phase') && (
              <div
                className={cn(
                  'mt-0.5 font-mono text-[10px] font-bold',
                  redTiming.consumingReserve
                    ? 'text-gold-strong animate-pulse'
                    : redTiming.liveReserve <= 0
                      ? 'text-danger'
                      : 'text-muted',
                )}
                title="Thời gian gốc còn lại"
              >
                Gốc {formatClock(redTiming.liveReserve)}
              </div>
            )}
            <div className="text-[11px] font-semibold text-muted">
              Cost {formatCost(state.sides.red.totalCost)}
            </div>
          </div>
        </div>

        {/* Bên Phải - Red */}
        <div className="flex items-center justify-start gap-3">
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-extrabold uppercase tracking-wide text-text">
                {state.sides.red.player?.displayName ?? 'Trống'}
              </h2>
              <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">
                Red
              </span>
              {isBo3 && (
                <div className="flex items-center gap-1" title={`Tỷ số BO3: ${redSeriesWins} thắng`}>
                  <span className="mr-0.5 font-mono text-xs font-extrabold text-danger">
                    {redSeriesWins}
                  </span>
                  {Array.from({ length: winsToWin }, (_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'size-2.5 rounded-full border',
                        idx < redSeriesWins
                          ? 'border-danger bg-danger shadow-[0_0_8px_rgba(239,107,107,0.6)]'
                          : 'border-danger/40 bg-transparent',
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
              <span>
                Cost nhân vật: <strong className="text-text">{formatCost(redCosts.characterCost)}</strong>
              </span>
              <span>·</span>
              <span>
                Cost vũ khí: <strong className="text-text">{formatCost(redCosts.weaponCost)}</strong>
              </span>
              <span>·</span>
              <span className="font-semibold text-gold-strong">
                +{formatSeconds(state.sides.red.costPenaltySeconds)}
              </span>
              {redRefSec > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-pyro">
                    Tinh luyện +{formatSeconds(redRefSec)}
                  </span>
                </>
              )}
              {redTotalOvertime > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-danger">
                    Phạt giờ +{formatSeconds(redTotalOvertime)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div>{renderStatusIcon('red', redReadyDone, redActive)}</div>
        </div>
      </div>
    </section>
  )
}
