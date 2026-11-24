import { computeCostBreakdown } from './lineup'
import { getSeriesWinsForSide } from './series'
import { formatCost, formatSeconds } from '@/domain/cost'
import type { MatchSide } from '@/domain/ruleset'
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

  const blueSavedOvertime = state.sides.blue.overtimePenaltySeconds ?? 0
  const redSavedOvertime = state.sides.red.overtimePenaltySeconds ?? 0

  const blueLiveOvertime =
    countdown !== null &&
    countdown < 0 &&
    ((state.status === 'drafting' && activeStep?.side === 'blue') ||
      (state.status === 'weapon_phase' && !state.sides.blue.weaponsLocked))
      ? -countdown
      : 0

  const redLiveOvertime =
    countdown !== null &&
    countdown < 0 &&
    ((state.status === 'drafting' && activeStep?.side === 'red') ||
      (state.status === 'weapon_phase' && !state.sides.red.weaponsLocked))
      ? -countdown
      : 0

  const blueTotalOvertime = blueSavedOvertime + blueLiveOvertime
  const redTotalOvertime = redSavedOvertime + redLiveOvertime
  const isBo3 = state.format === 'bo3'
  const winsToWin = state.winsToWin ?? 2
  const blueSeriesWins = getSeriesWinsForSide(state, 'blue')
  const redSeriesWins = getSeriesWinsForSide(state, 'red')

  const blueClock =
    state.status === 'drafting'
      ? activeStep?.side === 'blue'
        ? formatClock(countdown)
        : state.ruleset.perTurnSeconds > 0
          ? formatClock(state.ruleset.perTurnSeconds)
          : '--:--'
      : state.status === 'weapon_phase'
        ? state.sides.blue.weaponsLocked
          ? 'Đã khóa'
          : formatClock(countdown)
        : state.sides.blue.finalScore !== null
          ? formatSeconds(state.sides.blue.finalScore)
          : '—'

  const redClock =
    state.status === 'drafting'
      ? activeStep?.side === 'red'
        ? formatClock(countdown)
        : state.ruleset.perTurnSeconds > 0
          ? formatClock(state.ruleset.perTurnSeconds)
          : '--:--'
      : state.status === 'weapon_phase'
        ? state.sides.red.weaponsLocked
          ? 'Đã khóa'
          : formatClock(countdown)
        : state.sides.red.finalScore !== null
          ? formatSeconds(state.sides.red.finalScore)
          : '—'

  return (
    <section
      aria-label="Bảng điểm trận đấu"
      className="panel grid grid-cols-1 items-center gap-3 border-line/80 bg-bg/75 px-4 py-3 md:grid-cols-[1fr_auto_1fr]"
    >
      {/* Bên Trái - Blue */}
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="order-1 md:order-none">{renderStatusIcon('blue', blueReadyDone, blueActive)}</div>
        <div className="min-w-0 text-left md:text-right">
          <div className="flex items-center gap-2 md:justify-end">
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
            <h2 className="truncate text-base font-extrabold uppercase tracking-wide text-text sm:text-lg">
              {state.sides.blue.player?.displayName ?? 'Trống'}
            </h2>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted md:justify-end">
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
      <div className="flex items-center justify-center gap-4 border-y border-line/50 py-2 md:border-y-0 md:px-4 md:py-0">
        <div className="min-w-16 text-center">
          <div
            className={cn(
              'font-mono text-xl font-extrabold sm:text-2xl',
              blueLiveOvertime > 0
                ? 'text-danger animate-pulse'
                : state.status === 'weapon_phase' && state.sides.blue.weaponsLocked
                  ? 'text-sm font-bold text-success'
                  : activeStep?.side === 'blue'
                    ? 'text-hydro'
                    : 'text-text',
            )}
          >
            {blueClock}
          </div>
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
          <div className="text-xl font-black tracking-wider text-gold-strong sm:text-2xl">
            {PHASE_TITLE[state.status]}
          </div>
          {state.status === 'drafting' && activeStep && (
            <div className="text-[11px] font-semibold text-muted">
              Bước {state.currentStepIndex + 1}/{state.ruleset.draftSteps.length}
            </div>
          )}
        </div>

        <div className="min-w-16 text-center">
          <div
            className={cn(
              'font-mono text-xl font-extrabold sm:text-2xl',
              redLiveOvertime > 0
                ? 'text-danger animate-pulse'
                : state.status === 'weapon_phase' && state.sides.red.weaponsLocked
                  ? 'text-sm font-bold text-success'
                  : activeStep?.side === 'red'
                    ? 'text-danger'
                    : 'text-text',
            )}
          >
            {redClock}
          </div>
          <div className="text-[11px] font-semibold text-muted">
            Cost {formatCost(state.sides.red.totalCost)}
          </div>
        </div>
      </div>

      {/* Bên Phải - Red */}
      <div className="flex items-center justify-between gap-3 md:justify-start">
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-extrabold uppercase tracking-wide text-text sm:text-lg">
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
    </section>
  )
}
